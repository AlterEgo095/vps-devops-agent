/**
 * Tool: rag_query — Query the infrastructure knowledge base
 * Risk: SAFE (read-only semantic search)
 */

export default {
  name: 'rag_query',
  description: 'Search the infrastructure knowledge base for relevant information about the server. Uses semantic search to find matching configurations, services, Docker containers, and other infrastructure data. Use this before making decisions to understand the current state.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query about the infrastructure (e.g., "what web servers are running", "nginx configuration for api.example.com")'
      },
      server_id: {
        type: 'number',
        description: 'Server ID to search within',
        default: null
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5
      }
    },
    required: ['query']
  },
  risk_level: 'SAFE',
  needs_approval: false,
  category: 'rag',

  async implementation(serverConfig, args, context) {
    // This tool will be fully functional once the RAG module is implemented
    // For now, it returns a placeholder response
    try {
      // Try to import the knowledge retriever
      const { knowledgeRetriever } = await import('../rag/index.js');

      const results = await knowledgeRetriever.search(args.query, {
        serverId: args.server_id || context.serverId,
        maxResults: args.max_results || 5
      });

      return {
        success: true,
        query: args.query,
        results: results.matches || [],
        count: results.matches?.length || 0,
        context_assembled: results.context || null
      };
    } catch (error) {
      // RAG module not yet available
      return {
        success: true,
        query: args.query,
        results: [],
        count: 0,
        note: 'RAG knowledge base is not yet configured. Infrastructure data collection needs to be set up first.'
      };
    }
  }
};
