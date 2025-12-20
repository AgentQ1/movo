# ADCS - Contact Database & File Storage

## 🎉 Successfully Deployed!

Your Cloudflare Worker is live at:
**https://adcs-worker.adcs-api-9482.workers.dev**

## ✅ Completed Setup

- ✅ Wrangler CLI installed
- ✅ Authenticated with Cloudflare
- ✅ R2 bucket `central-files` created
- ✅ D1 database `ADCS_DB` created with schema
- ✅ KV namespace created for file aliases
- ✅ Worker deployed with all bindings

## 📊 Resources Created

### D1 Database: ADCS_DB
- **Database ID**: `bd26283b-40be-4560-bdf8-3dc2110cdc39`
- **Tables**: 
  - `files` - File metadata storage
  - `contacts` - Contact information
  - `file_contacts` - Links between files and contacts

### R2 Bucket: central-files
- Global file storage with automatic deduplication
- Optimized for worldwide access

### KV Namespace: FILE_ALIASES
- **ID**: `9cdf7de635d34efb803d916d86d38369`
- Fast alias lookups for files

## 🔌 API Endpoints

### Contacts
- `GET /api/contacts` - List all contacts
- `POST /api/contacts` - Create new contact
- `GET /api/contacts/:id` - Get contact by ID
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

### Files
- `POST /api/files/upload` - Upload file (supports multipart/form-data)
- `GET /api/files/:key` - Download file
- `GET /api/files` - List all files

### Health
- `GET /health` - Health check endpoint

## 📝 Example Usage

### Create a Contact
```bash
curl -X POST https://adcs-worker.adcs-api-9482.workers.dev/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "name": "John Doe"}'
```

### Upload a File
```bash
curl -X POST https://adcs-worker.adcs-api-9482.workers.dev/api/files/upload \
  -F "file=@document.pdf" \
  -F "contactId=1"
```

### List Contacts
```bash
curl https://adcs-worker.adcs-api-9482.workers.dev/api/contacts
```

## 🛠️ Local Development

```bash
# Run locally
wrangler dev

# View logs
wrangler tail

# Test database queries
wrangler d1 execute ADCS_DB --command "SELECT * FROM contacts"
```

## 📦 Optional: OpenRouter API Key

To enable AI features, set your OpenRouter API key:

```bash
wrangler secret put OPENROUTER_API_KEY
```

## 🔄 Redeployment

To redeploy after making changes:

```bash
wrangler deploy
```

## 📁 Project Structure

```
/Users/agentq/Documents/movo/
├── databasev1.html          # Frontend interface
├── wrangler.toml            # Cloudflare configuration
├── src/
│   └── index.js             # Worker code
├── migrations/
│   └── 0001_init_schema.sql # Database schema
└── README.md                # This file
```

## 🌐 Dashboard Links

- [Cloudflare Dashboard](https://dash.cloudflare.com/429a853a6dd11c1a13e857db35424943)
- [Workers Dashboard](https://dash.cloudflare.com/429a853a6dd11c1a13e857db35424943/workers)
- [R2 Dashboard](https://dash.cloudflare.com/429a853a6dd11c1a13e857db35424943/r2)
- [D1 Dashboard](https://dash.cloudflare.com/429a853a6dd11c1a13e857db35424943/d1)

## 🎯 Next Steps

1. Update your HTML frontend to point to the worker URL
2. Test the API endpoints
3. Add custom domain (optional)
4. Set up monitoring and alerts
