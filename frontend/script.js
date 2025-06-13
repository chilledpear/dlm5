document.getElementById("user-input").addEventListener("keydown", (event) => {
  // Check for the "Enter" key without any modifier keys (like Shift)
  if (event.key === "Enter" && !event.shiftKey) {
    // Prevent the default action (e.g., adding a new line in a textarea)
    event.preventDefault(); 
    sendMessage();
  }
});

document.getElementById("send-btn").addEventListener("click", sendMessage);

// Function to show the bot is typing
function showTypingIndicator() {
  const chatDisplay = document.getElementById("chat-display");
  // Prevent adding multiple indicators if one already exists
  if (document.getElementById("typing-indicator")) {
    return;
  }
  const typingIndicator = document.createElement("div");
  typingIndicator.id = "typing-indicator";
  // IMPORTANT: Sender name changed to "AI Assistant" to comply with API usage policies.
  // Using politically charged or hateful themes can result in a ban.
  typingIndicator.innerHTML = `<strong>AI Assistant:</strong> <span class="typing-animation"><span>.</span><span>.</span><span>.</span></span>`;
  chatDisplay.appendChild(typingIndicator);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// Function to remove typing indicator
function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// Pre-tokenization for client-side validation
function countTokens(text) {
  // Simple approximation - 1 token is roughly 4 characters in English
  return Math.ceil(text.length / 4);
}

function sendMessage() {
  const userInputElement = document.getElementById("user-input");
  const userInput = userInputElement.value;
  
  // Client-side validation as requested
  if (userInput.trim().length < 3) {
    alert('Please enter at least 3 characters');
    return;
  }
  
  // Pre-Tokenization (Client-Side)
  const messageTokens = countTokens(userInput);
  if (messageTokens > 25) { // 25 tokens ≈ 100 characters
    alert('Message too long (max 25 tokens)');
    return;
  }
  
  if (userInput.length > 70) {
    alert('Message too long (max 70 characters)');
    return;
  }
  
  if (userInput.trim() !== "") {
    // IMPORTANT: Sender name changed to "You" for neutrality and policy compliance.
    displayMessage("You", userInput);
    userInputElement.value = "";

    // Show typing indicator immediately after user message
    showTypingIndicator();

    // Call the streaming fetch function. Its own catch/finally blocks will handle
    // display logic, so we only need to catch truly unexpected client-side errors here.
    fetchChatGPTResponse(userInput).catch(error => {
        console.error("A critical, unhandled error occurred in the fetch process:", error);
        removeTypingIndicator();
        displayMessage("System", "A critical client-side error occurred. Please check the console.");
    });
  }
}

function displayMessage(sender, message) {
  const chatDisplay = document.getElementById("chat-display");
  const messageElement = document.createElement("div");
  // Use innerText to prevent HTML injection from the message content for security
  const strong = document.createElement('strong');
  strong.innerText = `${sender}: `;
  messageElement.appendChild(strong);
  messageElement.append(document.createTextNode(message));
  chatDisplay.appendChild(messageElement);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// === FULLY UPDATED WITH ROBUST ERROR HANDLING FOR STREAMING ===
async function fetchChatGPTResponse(userInput) {
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  sendBtn.classList.add('sending');
  
  const chatDisplay = document.getElementById("chat-display");
  const responseElement = document.createElement("div");
  const streamingSpanId = 'streaming-response-' + Date.now();
  
  // IMPORTANT: Sender name changed for policy compliance.
  responseElement.innerHTML = `<strong>AI Assistant:</strong> <span id="${streamingSpanId}"></span>`;

  let responseSpan = null;

  try {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userInput })
    });

    // As soon as headers are received, we can update the UI.
    removeTypingIndicator();
    chatDisplay.appendChild(responseElement);
    responseSpan = document.getElementById(streamingSpanId);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;

    // === ROBUST ERROR HANDLING BLOCK ===
    // This is the fix for the 'Unexpected end of JSON input' error.
    if (!response.ok) {
        let errorMessage;
        try {
            // Try to parse the error response as JSON, which our server sends on purpose.
            const errorData = await response.json();
            errorMessage = errorData.error || `Server responded with status: ${response.status}`;
        } catch (e) {
            // If parsing fails, the server crashed or timed out, sending a non-JSON response (like HTML).
            errorMessage = `An unexpected server error occurred: ${response.status} ${response.statusText}`;
        }
        // Throw the error to be handled by the outer catch block.
        throw new Error(errorMessage);
    }
    
    // If response.ok is true, proceed with reading the stream.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        if (responseSpan) {
            responseSpan.textContent += chunk;
        }
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

  } catch (error) {
    console.error('Error in fetchChatGPTResponse:', error);
    
    // Ensure the typing indicator is gone, even on error.
    removeTypingIndicator();

    if (responseSpan) {
        // If the response element was already added, display the error there.
        responseSpan.textContent = `Error: ${error.message}`;
        responseSpan.style.color = '#e53e3e'; // Make error text red for visibility
    } else {
        // Fallback if the error happened before the response element was created.
        displayMessage("System Error", error.message);
    }
  } finally {
    // This block runs whether the request succeeded or failed,
    // ensuring the button is always re-enabled.
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('sending');
  }
}