# Skinbiee: The Ultimate Render Deployment Guide 🚀

Follow this step-by-step master checklist to deploy Skinbiee perfectly. We have already pre-configured the codebase to handle all PWA caching, CORS syncing, and Cloudinary uploads.

---

## STEP 1: Set Up Your Database
Because Render's free tier spins down and deletes local disk files, we must use a cloud database for persistence.

1. Go to your **Render Dashboard** and click **New → PostgreSQL**.
2. Name it `skinbiee-db` (or whatever you prefer).
3. Once created, scroll down to the **Connections** section and strictly copy the **Internal Database URL** (or External if using Neon/Supabase). *Save this somewhere for Step 2.*

---

## STEP 2: Deploy the AI Backend (Web Service)
We will now deploy `analysis_server.py`.

1. Go to **Render Dashboard** and click **New → Web Service**.
2. Connect your GitHub repository containing the Skinbiee code.
3. **Configure the Service:**
   - **Name:** `skinbiee-backend`
   - **Environment:** `Python 3`
   - **Region:** (Choose closest to you)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn analysis_server:app`
4. **Environment Variables:** Scroll down to "Environment Variables" and click "Add Environment Variable". Add all of these:
   - `DATABASE_URL` → (Paste the Postgres URL you copied in Step 1)
   - `CLOUDINARY_CLOUD_NAME` → (Your Cloudinary Name)
   - `CLOUDINARY_API_KEY` → (Your Cloudinary Key)
   - `CLOUDINARY_API_SECRET` → (Your Cloudinary Secret)
   - `OPENAI_API_KEY` (or `GROQ_API_KEY`) → (Your AI API key)
5. Click **Create Web Service**. 
6. Wait 5-10 minutes for it to build. Once you see the green "Live" badge, copy the Render URL at the top left (it looks like `https://skinbiee-backend-xxx.onrender.com`).

---

## STEP 3: Link the Frontend to the Backend (Local Code Push)
Now that your backend is alive, we must tell your Frontend where to send data.

1. Open `frontend/skinbiee.js` locally in your VS Code.
2. Go to **Line 4**.
3. Replace the placeholder URL with the actual backend URL you just copied:
   ```javascript
   const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
       ? "http://localhost:5000" 
       : "https://skinbiee-backend-xxx.onrender.com"; // <-- PASTE YOUR RENDER URL HERE (do not include trailing slash /)
   ```
4. Save the file.
5. In your VS Code terminal, push this final change to GitHub:
   ```bash
   git add frontend/skinbiee.js
   git commit -m "Linking frontend to production backend"
   git push
   ```

---

## STEP 4: Deploy the Frontend (Static Site)
Your frontend is incredibly fast static HTML/JS/CSS. We will deploy it as a "Static Site" (which is free and blazing fast on Render).

1. Go to **Render Dashboard** and click **New → Static Site**.
2. Connect the **exact same GitHub repository** again.
3. **Configure the Site:**
   - **Name:** `skinbiee-app`
   - **Build Command:** *(Leave this completely empty)*
   - **Publish Directory:** `frontend`
4. Click **Create Static Site**.
   *Note: Because we already created the `_headers` file inside the `frontend` directory, Render will automatically apply the PWA caching rules to never cache your service worker! You don't have to configure anything else.*

---

## STEP 5: Final Validation & PWA Install! 🌟
Once your frontend is fully deployed, Render will give you the live Frontend URL (e.g., `https://skinbiee-app.onrender.com`).

1. Open that URL on your physical Smartphone in Chrome (Android) or Safari (iOS).
2. Create an account to log in *(The first login might take ~30-50 seconds as the backend wakes up)*.
3. Install the App:
   - **Android:** The "Install Skinbiee App" popup will appear automatically!
   - **iOS:** Tap the "Share" button at the bottom of Safari, and select "Add to Home Screen".
4. Exit the browser and launch the app directly from your phone's home screen!

You are now live! Congratulations! 🎉
