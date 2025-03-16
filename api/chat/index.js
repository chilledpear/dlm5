// Import the OpenAI SDK which will be used to communicate with DeepSeek API
// DeepSeek uses an OpenAI-compatible API format
const OpenAI = require('openai');

// Import dotenv to load environment variables from .env file if present
// This is especially useful during local development
require('dotenv').config();

// Export an async function that will handle the API requests
// This function follows the Vercel serverless function format
module.exports = async (req, res) => {
  // Set CORS headers to allow cross-origin requests
  // This ensures the API can be called from your frontend regardless of domain
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS requests for CORS
  // Browsers send these before actual requests to check if CORS is allowed
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests to this endpoint
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validate that the message exists in the request body
    if (!req.body || !req.body.message) {
      throw new Error('Message is required in the request body');
    }

    // Validate that the API key exists in environment variables
    // This is critical for authentication with DeepSeek's API
    if (!process.env.DEEPSEEK) {
      throw new Error('DEEPSEEK API key is missing from environment variables');
    }

    // Initialize the OpenAI client with DeepSeek's configuration
    // We're using the OpenAI SDK but pointing it to DeepSeek's API
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com', // DeepSeek's API endpoint
      apiKey: process.env.DEEPSEEK,        // Your DeepSeek API key from .env
      timeout: 30000,                      // 30 second timeout
      maxRetries: 2                        // Retry API calls up to 2 times if they fail
    });

    // Prepare the messages for the API call
    // We include a system message that defines the assistant's persona
    // and the user's message from the request
    const messages = [
      { 
        role: "system", 
        content: "You are a top female commander in Hitlers army." 
      },
      { 
        role: "user", 
        content: req.body.message 
      }
    ];

    // Make the API request to DeepSeek
    // We're using the chat completions endpoint with the deepseek-chat model
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",    // Using DeepSeek's chat model (V3)
      messages: messages,        // The prepared messages array
      temperature: 1.0,          // Controls randomness (0.0 to 2.0, higher = more random)
      max_tokens: 800,           // Limits the length of the generated response
    });

    // Extract the assistant's response from the API result
    const responseContent = completion.choices[0].message.content;

    // Return a successful response with the AI-generated content
    res.status(200).json({ response: responseContent });
    
  } catch (error) {
    // Log the full error details to the server console for debugging
    console.error('Error details:', error);
    
    // Initialize default error message and status code
    let errorMessage = 'Error processing your request';
    let statusCode = 500;
    
    // Provide more specific error messages based on the type of error
    if (error.status === 402) {
      // Handle insufficient balance errors from DeepSeek
      errorMessage = 'Insufficient balance in your DeepSeek account. Please add credits to continue.';
    } else if (error.message && error.message.includes('whatwg-url')) {
      // Handle missing dependency errors
      errorMessage = 'Server configuration error. Missing dependency. Please update your package.json.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      // Handle network connectivity errors
      errorMessage = 'Unable to connect to the AI service. Please try again later.';
    } else if (!req.body || !req.body.message) {
      // Handle missing message in request
      errorMessage = 'No message provided in request';
      statusCode = 400; // Bad Request
    } else if (!process.env.DEEPSEEK) {
      // Handle missing API key
      errorMessage = 'API configuration error. Please check server environment variables.';
    }
    
    // Return an error response with appropriate details
    // In development, include more details to help with debugging
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};