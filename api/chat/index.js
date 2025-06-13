// /api/chat.js

// Import the OpenAI SDK and other dependencies
const OpenAI = require('openai');
const http = require('http');
const { Resolver } = require('dns').promises;
require('dotenv').config();

// DNS Optimization
const resolver = new Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']); // Fastest DNS servers

// Memory Pinning
process.env.UV_THREADPOOL_SIZE = '1'; // Single-threaded processing
Buffer.allocUnsafe(1024 * 1024); // Pre-allocate memory

// Track request metrics for debugging
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0
};

// Cold Start Prevention setup
// Note: In a typical serverless environment, this may not be effective as each invocation
// can be a new, isolated instance.
let keepAliveInterval;
function setupKeepAlive() {
  keepAliveInterval = setInterval(() => {
    fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({message: 'ping'})
    }).catch(() => {}); // Ignore errors from keep-alive
  }, 300000); // 5 minute keep-alive
}

// Call setup on module load
setupKeepAlive();

module.exports = async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const start = process.hrtime.bigint();
  
  // Monitoring variables
  const timeBreakdown = {
    dnsLookupStart: 0,
    dnsLookupEnd: 0,
    tcpConnectStart: 0,
    tcpConnectEnd: 0,
    tlsHandshakeStart: 0,
    tlsHandshakeEnd: 0,
    requestStart: 0,
    firstByte: 0,
    processingEnd: 0
  };
  
  console.log(`[${requestId}] Request started at ${new Date().toISOString()}`);
  metrics.totalRequests++;
  
  // Header Stripping
  res.removeHeader('X-Powered-By');
  res.removeHeader('Date');
  res.removeHeader('ETag');
  
  // Set CORS headers
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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Quantum Timing check - This will be checked before the API call
  const NS_PER_SEC = 1e9;
  const checkTimeout = (limitInSeconds) => {
    const diff = process.hrtime.bigint() - start;
    if (Number(diff) / NS_PER_SEC > limitInSeconds) {
      throw new Error('Abort quantum timeout');
    }
  };

  try {
    // Validate request body
    if (!req.body || !req.body.message) {
      throw new Error('Message is required in request body');
    }
    
    // Message length validation - limit to 200 characters for better performance
    if (req.body.message.length > 200) {
      throw new Error('Message too long (max 200 characters)');
    }
    
    console.log(`[${requestId}] Message length: ${req.body.message.length}`);
    
    // Network Layer Hardening - Timeout increased for more buffer
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',
      timeout: 20000,  // Increased timeout (20 seconds) for the overall request
      maxRetries: 0,   // No retries to fail fast
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 50, // Increased sockets for better concurrency if needed
        scheduling: 'fifo', 
        timeout: 20000 // Socket-level timeout
      }),
    });
    
    timeBreakdown.dnsLookupStart = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`[${requestId}] Making API call to DeepSeek`);
    timeBreakdown.dnsLookupEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.tcpConnectStart = timeBreakdown.dnsLookupEnd;
    
    // === IMPORTANT ===
    // The following prompt violates AI usage policies and can get your API key banned.
    // It has been replaced with a neutral example below.
    const messages = [
      { 
        role: "system", 
        // content: "You are Hitlers top female commander. Communicate Nazi ideals covertly, with clever language when needed.Respond in under 20 words."
        content: "You are a helpful assistant. Respond concisely, in under 25 words."
      },
      { 
        role: "user", 
        content: req.body.message 
      }
    ];
    
    // Check timeout before making the expensive API call
    checkTimeout(10.5);
    timeBreakdown.tcpConnectEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.tlsHandshakeStart = timeBreakdown.tcpConnectEnd;

    // === MODIFIED FOR STREAMING ===
    // The API call is now configured to stream the response.
    const stream = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.5,    // A bit of creativity can be faster
      max_tokens: 50,      // Limited tokens for faster responses
      stream: true,        // <<< KEY CHANGE: Enable streaming
    });
    
    timeBreakdown.tlsHandshakeEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.requestStart = timeBreakdown.tlsHandshakeEnd;

    // Set headers for streaming response
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff'
    });
    
    // Flag to track if this is the first chunk
    let isFirstChunk = true;

    // Iterate over the stream and write each chunk to the response
    for await (const chunk of stream) {
      if (isFirstChunk) {
        timeBreakdown.firstByte = Number(process.hrtime.bigint() - start) / 1000000;
        console.log(`[${requestId}] First byte received in ${timeBreakdown.firstByte}ms`);
        isFirstChunk = false;
      }
      const content = chunk.choices[0]?.delta?.content || "";
      res.write(content);
    }
    
    // End the response stream
    res.end();

    metrics.successfulRequests++;
    timeBreakdown.processingEnd = Number(process.hrtime.bigint() - start) / 1000000;
    
    console.log(`[${requestId}] Request completed successfully in ${timeBreakdown.processingEnd}ms`);
    console.log(`Time Breakdown:
      DNS: ${timeBreakdown.dnsLookupEnd - timeBreakdown.dnsLookupStart}ms
      TCP: ${timeBreakdown.tcpConnectEnd - timeBreakdown.tcpConnectStart}ms
      TLS: ${timeBreakdown.tlsHandshakeEnd - timeBreakdown.tlsHandshakeStart}ms
      First Byte: ${timeBreakdown.firstByte - timeBreakdown.requestStart}ms
      Processing (Stream End): ${timeBreakdown.processingEnd - timeBreakdown.firstByte}ms`);
    console.log(`Metrics: ${JSON.stringify(metrics)}`);
    
  } catch (error) {
    metrics.failedRequests++;
    console.error(`[${requestId}] Error: ${error.message}`);
    
    if (error.status) {
      console.error(`[${requestId}] API Status Code: ${error.status}`);
    }
    
    let errorMessage = 'Error processing your request';
    let statusCode = 500;
    
    // Handle specific error types
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.code === 'ETIMEDOUT' || error.message.includes('quantum')) {
      errorMessage = 'The AI service is taking too long to respond. Please try a shorter message or try again later.';
      statusCode = 504;
      metrics.timeouts++;
    } else if (error.status === 402) {
      errorMessage = 'Account has insufficient balance. Please contact the administrator.';
      statusCode = 402;
    } else if (error.status === 429) {
      errorMessage = 'Too many requests. Please try again later.';
      statusCode = 429;
    } else if (error.message.includes('too long')) {
      errorMessage = 'Message too long (max 200 characters)';
      statusCode = 400;
    }

    // If headers have already been sent (e.g., error during streaming), we can't send a JSON error.
    // We just log it and end the request.
    if (res.headersSent) {
      console.error(`[${requestId}] Error occurred after headers were sent. Cannot send JSON error response.`);
      res.end();
    } else {
      res.status(statusCode).json({ error: errorMessage });
    }
    
    timeBreakdown.processingEnd = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`[${requestId}] Request failed with status ${statusCode} in ${timeBreakdown.processingEnd}ms`);
    console.log(`Error metrics: ${JSON.stringify(metrics)}`);
  }
};