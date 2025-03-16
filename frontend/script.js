document.getElementById("user-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("send-btn").addEventListener("click", sendMessage);

// Function to show the bot is typing
function showTypingIndicator() {
  const chatDisplay = document.getElementById("chat-display");
  const typingIndicator = document.createElement("div");
  typingIndicator.id = "typing-indicator";
  typingIndicator.innerHTML = `<strong>Officer:</strong> <span class="typing-animation"><span>.</span><span>.</span><span>.</span></span>`;
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
  const userInput = document.getElementById("user-input").value;
  
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
    displayMessage("Disciple of ", userInput);
    document.getElementById("user-input").value = "";

    // Show typing indicator immediately after user message
    showTypingIndicator();

    fetchChatGPTResponse(userInput).then((response) => {
      // Remove typing indicator before showing the response
      removeTypingIndicator();
      displayMessage(" Officer", response);
    }).catch(error => {
      // Make sure to remove typing indicator even if there's an error
      removeTypingIndicator();
      displayMessage(" Officer", "Error: Please try again later");
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

async function fetchChatGPTResponse(userInput) {
  // Add loading state to button
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  sendBtn.classList.add('sending');
  
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

    const endTime = performance.now();
    console.log(`Request took ${endTime - startTime}ms to complete`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.response || 'No response from AI';
  } catch (error) {
    console.error('Error:', error);
    return 'DeepSeek Servers Slow AF. Try Again and it should work';
  } finally {
    // Reset button state
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('sending');
  }
}