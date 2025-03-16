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
  typingIndicator.innerHTML = `<strong>Al16z:</strong> <span class="typing-animation"><span>.</span><span>.</span><span>.</span></span>`;
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

function sendMessage() {
  const userInput = document.getElementById("user-input").value;
  
  // Client-side validation as requested
  if (userInput.trim().length < 3) {
    alert('Please enter at least 3 characters');
    return;
  }
  
  if (userInput.length > 200) {
    alert('Message too long (max 200 characters)');
    return;
  }
  
  if (userInput.trim() !== "") {
    displayMessage("Degen", userInput);
    document.getElementById("user-input").value = "";

    // Show typing indicator immediately after user message
    showTypingIndicator();

    fetchChatGPTResponse(userInput).then((response) => {
      // Remove typing indicator before showing the response
      removeTypingIndicator();
      displayMessage("Al16z", response);
    }).catch(error => {
      // Make sure to remove typing indicator even if there's an error
      removeTypingIndicator();
      displayMessage("Al16z", "Error: Please try again later");
      console.error("Error fetching response:", error);
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
    const baseUrl = window.location.origin;
    
    // Step 1: Initial request to start processing
    console.log("Initiating chat request...");
    const initResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userInput })
    });

    if (!initResponse.ok) {
      throw new Error(`HTTP error! status: ${initResponse.status}`);
    }
    
    const initData = await initResponse.json();
    
    if (!initData.requestId) {
      throw new Error('No request ID received from server');
    }
    
    console.log(`Request initiated with ID: ${initData.requestId}`);
    
    // Step 2: Poll for results
    const result = await pollForResult(initData.requestId);
    return result;
    
  } catch (error) {
    console.error('Error:', error);
    return `Error: ${error.message || 'Please try again later'}`;
  } finally {
    // Reset button state
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('sending');
  }
}

async function pollForResult(requestId) {
  const baseUrl = window.location.origin;
  const maxAttempts = 45; // Poll for up to 45 seconds (at 1-second intervals)
  let attempts = 0;
  
  console.log(`Starting to poll for results with request ID: ${requestId}`);
  
  while (attempts < maxAttempts) {
    try {
      // Wait 1 second between polling attempts
      if (attempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts}`);
      
      const response = await fetch(`${baseUrl}/api/chat/status?requestId=${requestId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error("Request not found. It may have expired.");
          throw new Error("Your request has expired or was not found. Please try again.");
        } else {
          console.error(`Status check failed with HTTP status: ${response.status}`);
          throw new Error(`Status check failed: ${response.status}`);
        }
      }
      
      const data = await response.json();
      console.log(`Poll result: status = ${data.status}`);
      
      // Check the status of the request
      if (data.status === 'completed') {
        console.log("Request completed successfully!");
        return data.result;
      } else if (data.status === 'error') {
        console.error(`Request failed with error: ${data.error}`);
        throw new Error(data.error || 'Processing failed on the server');
      }
      
      // If we're here, the status is still 'pending', so we continue polling
      
    } catch (error) {
      console.error('Polling error:', error);
      throw error;
    }
  }
  
  // If we've hit the maximum number of attempts and still haven't received a result
  console.error("Maximum polling attempts reached without getting a response");
  throw new Error('Request processing timed out. Please try again with a shorter message.');
}