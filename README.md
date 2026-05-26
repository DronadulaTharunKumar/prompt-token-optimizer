# Prompt Token Optimizer

A local browser tool for turning rough text and image context into tighter prompts for higher-quality AI output with lower token use.

## Run In Browser

Run:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

You can still open `index.html` directly if you want the no-server version.

## Enable Free AI Optimization

Create a `.env` file in this folder:

```text
GROQ_API_KEY=your_free_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

Get a free Groq API key from:

```text
https://console.groq.com/keys
```

Then restart the server:

```bash
npm start
```

Without `GROQ_API_KEY`, the app still works with its local fallback optimizer. With the key, the browser calls `/api/optimize`, and the server securely sends the request to Groq's free-tier model.

OpenAI is still supported as an optional paid upgrade:

```text
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

## Deploy To Cloud

### Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add environment variable `GROQ_API_KEY`.
4. Keep the default settings and deploy.

### Netlify

1. Push this folder to GitHub.
2. Import the repo in Netlify.
3. Add environment variable `GROQ_API_KEY`.
4. Use publish directory `.` and no build command.

### Render

1. Push this folder to GitHub.
2. Create a new Render web service from the repo.
3. Add environment variable `GROQ_API_KEY`.
4. Render can use `render.yaml`, or set:

```text
Build command: npm install
Start command: npm start
```

## Features

- Paste rough text, notes, or an existing prompt.
- Upload an image to include image-aware instructions.
- Choose task type and output style.
- Set a target token budget.
- Generate a compact prompt with role, task, requirements, and output format.
- View rough token estimates, compression, and prompt score.
- Copy or download the optimized prompt.

## Note

This version runs fully offline in the browser. It does not call an AI model or upload your files anywhere. Image handling uses metadata and preview only; the optimized prompt tells the AI model how to inspect the image when you attach it in your AI chat.
