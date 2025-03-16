document.getElementById("user-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("send-btn").addEventListener("click", sendMessage);

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

    fetchChatGPTResponse(userInput).then((response) => {
      displayMessage("Al16z", response);
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
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userInput })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.response || 'No response from AI';
  } catch (error) {
    console.error('Error:', error);
    return 'Error: Please try again later';
  } finally {
    // Reset button state
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('sending');
  }
}