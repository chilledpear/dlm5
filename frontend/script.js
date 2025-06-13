document.getElementById("user-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    // Prevent the default Enter key behavior (like adding a new line)
    event.preventDefault(); 
    sendMessage();
  }
});

document.getElementById("send-btn").addEventListener("click", sendMessage);

// Function to show the bot is typing
function showTypingIndicator() {
  const chatDisplay = document.getElementById("chat-display");
  // Check if an indicator already exists to prevent duplicates
  if (document.getElementById("typing-indicator")) {
    return;
  }
  const typingIndicator = document.createElement("div");
  typingIndicator.id = "typing-indicator";
  // IMPORTANT: Sender name changed to comply with API usage policies.
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
    // IMPORTANT: Sender name changed to comply with API usage policies.
    displayMessage("You", userInput);
    userInputElement.value = "";

    // Show typing indicator immediately after user message
    showTypingIndicator();

    // MODIFIED: This now calls the streaming function.
    // The .then() and .catch() blocks for displaying messages are removed
    // because fetchChatGPTResponse now handles its own display logic.
    fetchChatGPTResponse(userInput).catch(error => {
        // This catch is for unexpected, catastrophic client-side errors.
        console.error("A critical error occurred in the fetch process:", error);
        removeTypingIndicator();
        // IMPORTANT: Sender name changed to comply with API usage policies.
        displayMessage("System", "A critical client-side error occurred. Please check the console.");
    });
  }
}

function displayMessage(sender, message) {
  const chatDisplay = document.getElementById("chat-display");
  const messageElement = document.createElement("div");
  messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatDisplay.appendChild(messageElement);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}


// === FULLY UPDATED FOR STREAMING ===
// This function now handles a streaming text response instead of a single JSON object.
async function fetchChatGPTResponse(userInput) {
  // Add loading state to button
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  sendBtn.classList.add('sending');
  
  // Create the bot's message container ahead of time to stream content into it.
  const chatDisplay = document.getElementById("chat-display");
  const responseElement = document.createElement("div");
  // A unique ID for the streaming part of the message
  const streamingSpanId = 'streaming-response-' + Date.now();
  // IMPORTANT: Sender name changed to comply with API usage policies.
  responseElement.innerHTML = `<strong>AI Assistant:</strong> <span id="${streamingSpanId}"></span>`;

  let responseSpan = null;

  try {
    const startTime = performance.now();
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userInput })
    });

    // As soon as we get a response (even before reading body), remove the indicator.
    removeTypingIndicator();
    // Now add the response element to the chat
    chatDisplay.appendChild(responseElement);
    responseSpan = document.getElementById(streamingSpanId);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;

    const endTime = performance.now();
    console.log(`Request headers sent and response received in ${endTime - startTime}ms`);

    if (!response.ok) {
        // If the server returned an error (like 429 or 504), it will be in JSON format.
        const errorData = await response.json();
        // Throw an error to be caught by the catch block below.
        throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    // The body is now a ReadableStream, not a single JSON object
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true }); // Decode the chunk of data
        responseSpan.textContent += chunk; // Append the text to our span
        chatDisplay.scrollTop = chatDisplay.scrollHeight; // Keep scrolled to the bottom
    }

  } catch (error) {
    console.error('Error in fetchChatGPTResponse:', error);
    // If an error occurs, display it in the message area.
    removeTypingIndicator(); // Ensure indicator is gone on error
    if (responseSpan) {
        responseSpan.textContent = `Error: ${error.message}`;
        responseSpan.style.color = '#e53e3e'; // Make error text red
    } else {
        // Fallback if the response element wasn't even created yet
        displayMessage("System Error", error.message);
    }
  } finally {
    // Reset button state regardless of success or failure
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('sending');
  }
}