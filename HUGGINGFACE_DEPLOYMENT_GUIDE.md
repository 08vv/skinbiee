# Skinbiee: Hugging Face Spaces Deployment Guide 🚀

Deploying Skinbiee to a Hugging Face Space is now easier than ever. We've switched to a **Dockerized** single-service model that hosts both the backend and frontend in one Space.

---

## STEP 1: Create a New Space
1. Go to [Hugging Face Spaces](https://huggingface.co/spaces) and click **New Space**.
2. **Name:** `skinbiee` (or your choice).
3. **Space SDK:** Select **Docker**.
4. **Visibility:** Public or Private.
5. Click **Create Space**.

---

## STEP 2: Configure Secrets (IMPORTANT)
Your app needs environment variables to talk to Cloudinary and the AI models. 
1. In your Space, go to **Settings → Variables and Secrets**.
2. Add the following **Secrets**:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `DATABASE_URL` (Use a cloud Postgres URL like Neon.tech or Supabase)
   - `OPENAI_API_KEY` (or `GROQ_API_KEY` if using Groq)
   - `CORS_ORIGINS` (Set to `*`)

---

## STEP 3: Push Your Code
Since we've initialized **Git LFS** for your image assets, you can now push your code without rejection.

1. In your local VS Code terminal, commit and push:
   ```bash
   git add .
   git commit -m "Migration to Hugging Face Docker Space with LFS"
   git push hf main --force
   ```
   *(Note: replace `hf` with your remote name if different)*

---

## STEP 4: Link Frontend to Backend
Since the app is now served from a single port, we need to ensure `skinbiee.js` points to the correct relative path.

1. Open `frontend/skinbiee.js`.
2. Ensure **Line 4** is set to:
   ```javascript
   const API_BASE_URL = window.location.origin;
   ```
3. Save, commit, and push.

---

## STEP 5: Launch! 🌟
Hugging Face will automatically build your Docker container. Once it shows **Running**, your app will be live at:
`https://huggingface.co/spaces/YOUR_USERNAME/skinbiee`

Enjoy Skinbiee on the cloud! 🎉✨
