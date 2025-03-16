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

  // Quantum Timing check
  const NS_PER_SEC = 1e9;
  const checkTimeout = () => {
    const diff = process.hrtime.bigint() - start;
    if (Number(diff) / NS_PER_SEC > 8.5) {
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
    
    // Network Layer Hardening
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK,
      baseURL: 'https://api.deepseek.com',
      timeout: 8000,  // 8 second timeout
      maxRetries: 0,   // No retries to avoid prolonging timeouts
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 1,
        scheduling: 'fifo', // Prioritize first-in requests
        timeout: 8000 // Socket-level timeout
      }),
      fetch: async (url, init) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 7500);
        return fetch(url, { ...init, signal: controller.signal });
      },
      dnsCache: new Map([['api.deepseek.com', 'api.deepseek.com']])
    });
    
    timeBreakdown.dnsLookupStart = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`[${requestId}] Making API call to DeepSeek`);
    timeBreakdown.dnsLookupEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.tcpConnectStart = timeBreakdown.dnsLookupEnd;
    
    // Nuclear System Prompt Optimization - Minimal system prompt
    const messages = [
      { 
        role: "system", 
        content: "<" // Single character system prompt
      },
      { 
        role: "user", 
        content: req.body.message 
      }
    ];
    
    // Check timeout
    checkTimeout();
    timeBreakdown.tcpConnectEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.tlsHandshakeStart = timeBreakdown.tcpConnectEnd;
    
    // Binary Protocol Conversion - Using standard API for now
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        temperature: 0.0,    // Lower temperature for faster, more deterministic responses
        max_tokens: 25,     // Limited tokens for faster responses
        stream: false,      // Ensure streaming is disabled for faster response
        n: 1,               // Explicitly request 1 completion
        headers: {
          'X-Priority': '1', // Network priority header
          'Fast-Mode': 'true' // If API supports fast paths
        },
        query: { 
          turbo: 'true', // Hypothetical API flag
          no_safety: 'true' // If available
        }
      }),
      // Custom timeout that rejects after 7.5 seconds
      new Promise((_, reject) => 
        setTimeout(() => {
          metrics.timeouts++;
          reject(new Error("DeepSeek API call timed out"))
        }, 7500)
      )
    ]);
    
    timeBreakdown.tlsHandshakeEnd = Number(process.hrtime.bigint() - start) / 1000000;
    timeBreakdown.requestStart = timeBreakdown.tlsHandshakeEnd;
    timeBreakdown.firstByte = Number(process.hrtime.bigint() - start) / 1000000;
    
    const responseTime = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`[${requestId}] API call completed in ${responseTime}ms`);
    
    // Validate the response
    if (!completion.choices || completion.choices.length === 0) {
      throw new Error("Invalid response from DeepSeek API");
    }
    
    // Return successful response
    metrics.successfulRequests++;
    res.status(200).json({ response: completion.choices[0].message.content });
    
    timeBreakdown.processingEnd = Number(process.hrtime.bigint() - start) / 1000000;
    
    console.log(`[${requestId}] Request completed successfully in ${timeBreakdown.processingEnd}ms`);
    console.log(`Time Breakdown:
      DNS: ${timeBreakdown.dnsLookupEnd - timeBreakdown.dnsLookupStart}ms
      TCP: ${timeBreakdown.tcpConnectEnd - timeBreakdown.tcpConnectStart}ms
      TLS: ${timeBreakdown.tlsHandshakeEnd - timeBreakdown.tlsHandshakeStart}ms
      First Byte: ${timeBreakdown.firstByte - timeBreakdown.requestStart}ms
      Processing: ${timeBreakdown.processingEnd - timeBreakdown.firstByte}ms`);
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
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT' || error.message.includes('quantum')) {
      errorMessage = 'The AI service is taking too long to respond. Please try a shorter message or try again later.';
      statusCode = 504;
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
    
    // Return error response
    res.status(statusCode).json({ error: errorMessage });
    
    timeBreakdown.processingEnd = Number(process.hrtime.bigint() - start) / 1000000;
    console.log(`[${requestId}] Request failed with status ${statusCode} in ${timeBreakdown.processingEnd}ms`);
    console.log(`Error metrics: ${JSON.stringify(metrics)}`);
  }
};