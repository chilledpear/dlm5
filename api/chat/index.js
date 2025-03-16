// Import the OpenAI SDK - DeepSeek uses an OpenAI-compatible API
const OpenAI = require('openai');

module.exports = async (req, res) => {
  // Set CORS headers to allow cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Verify this is a POST request, otherwise return 405 Method Not Allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Initialize the OpenAI client with DeepSeek's base URL and your API key
  const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com', // DeepSeek's API endpoint
    apiKey: process.env.DEEPSEEK       // Using your DeepSeek API key from .env
  });

  try {
    // Make the API request to DeepSeek
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",  // Using DeepSeek-V3 model
      messages: [
        // System message to define the assistant's persona
        { 
          role: "system", 
          content: "You are a top female commander in Hitlers army." 
        },
        // User's message from the request body
        { 
          role: "user", 
          content: req.body.message 
        }
      ],
      // Optional parameters you could add:
      // temperature: 1.3,  // Recommended for general conversation
      // max_tokens: 2000,  // Control max output length
    });

    // Return the completion response to the client
    res.status(200).json({ response: completion.choices[0].message.content });
    
  } catch (error) {
    // Log the error and return a 500 status code
    console.error('Error:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
};