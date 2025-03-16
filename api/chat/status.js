// This file handles the status check endpoint for the chat API

module.exports = async (req, res) => {
    const requestId = req.query.requestId;
  
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
  
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      // Validate request ID
      if (!requestId) {
        return res.status(400).json({ error: 'Request ID is required' });
      }
  
      console.log(`Status check for request: ${requestId}`);
  
      // Check if global.pendingRequests exists
      if (!global.pendingRequests) {
        return res.status(404).json({ error: 'Request tracking system not initialized' });
      }
  
      // Check if the request exists
      if (!global.pendingRequests[requestId]) {
        return res.status(404).json({ error: 'Request not found. It may have expired or never existed.' });
      }
  
      const request = global.pendingRequests[requestId];
  
      // Return the request status
      return res.status(200).json({
        requestId: requestId,
        status: request.status,
        result: request.result,
        error: request.error,
        timestamp: request.timestamp,
        processingTime: request.processingTime
      });
  
    } catch (error) {
      console.error(`Status check error: ${error.message}`);
      return res.status(500).json({ error: 'Error checking request status' });
    }
  };