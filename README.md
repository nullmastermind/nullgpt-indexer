# NullGPT Indexer

A powerful document indexing and querying service that supports multiple AI providers including OpenAI and Google's Generative AI. This service creates vector embeddings of your documents and enables semantic search capabilities.

## Features

- Multiple AI provider support (OpenAI, Google Generative AI)
- Document indexing with vector embeddings
- Semantic search capabilities
- Rate limiting and caching
- Configurable chunk sizes for document processing
- REST API endpoints for document management
- Git integration for document updates

## Demo

Watch our demo video to see NullGPT Indexer in action:

[![NullGPT Indexer Demo](https://img.youtube.com/vi/oRtJhmcd7o4/0.jpg)](https://www.youtube.com/watch?v=oRtJhmcd7o4)

## Prerequisites

- Node.js 18.16.1 or higher
- Yarn package manager
- OpenAI API key and/or Google API key

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd nullgpt-indexer
```

2. Install dependencies:
```bash
npm i --force
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Configure your `.env` file with appropriate API keys and settings.

## Environment Configuration

Essential environment variables:

```env
SERVER_PORT=3457                # Server port number
EMBEDDINGS=google              # Embedding provider (google or openai)
EMBEDDING_MODEL=text-embedding-004  # Embedding model to use
EMBEDDING_DIMENSIONS=768       # Embedding dimensions
MAX_RETRIES=10                # Maximum retry attempts

# API Keys
GOOGLE_API_KEY=your-google-api-key
OPENAI_API_KEY=your-openai-api-key

# Optional Configurations
CONTEXTUAL_API_KEY=your-contextual-api-key
CONTEXTUAL_MODEL_NAME=gpt-4o-mini

# Rerank Configuration (Optional)
VOYAGE_API_KEY=your-voyage-api-key          # API key for Voyage reranking
VOYAGE_RERANK_MODEL=rerank-2                # Rerank model to use
VOYAGE_RERANK_MODEL_CONTEXT_LENGTH=16000    # Maximum context length for reranking
```

## Usage

### Development Mode

```bash
yarn start:dev
```

### Production Mode

```bash
yarn build
yarn start
```

### Creating Distribution Package

```bash
yarn package
```

## API Endpoints

- `POST /api/index` - Index documents
- `POST /api/query` - Query indexed documents
- `GET /api/docs` - List available documents
- `POST /api/update-doc` - Update document content
- `POST /api/add-doc` - Add new document
- `POST /api/git-pull` - Pull latest changes from git
- `GET /api/get-version` - Get service version

## Project Structure

```
nullgpt-indexer/
├── src/
│   ├── handler/       # API endpoint handlers
│   ├── utility/       # Utility functions and classes
│   ├── constant.ts    # Global constants
│   └── server.ts      # Express server setup
├── docs/             # Document storage
├── indexes/          # Vector indexes storage
└── build/           # Compiled JavaScript files
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- LangChain for vector store capabilities
- FAISS for efficient similarity search
- Express.js for API server
- Various AI providers for embedding generation

---

For more information about using this indexer, please visit: https://gpt.dongnv.dev
