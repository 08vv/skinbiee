# 🚀 Skinbiee Deployment Guide (Render)

Welcome to the production deployment guide! Following these steps will securely move your Skinbiee app from your local machine to the internet so anyone can use it. 

We will deploy this in two parts to keep the architecture clean and free (or extremely cheap):
1. **The Backend AI Server** (Render Web Service)
2. **The Frontend App** (Render Static Site)

---

## 🛑 Phase 1: Prepare the Codebase for Production

Right now, your frontend (`skinbiee.js`) is hardcoded to look for the backend on your own computer (`http://localhost:5000`). We need to tell it to use the new cloud server *only when it's online*.

1. **Open** `frontend/skinbiee.js`.
2. **Change Line 1** from:
   ```javascript
   const API_BASE_URL = "http://localhost:5000";
   ```
   **To:**
   ```javascript
   // Automatically switches based on where the app is being run
   const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
       ? "http://localhost:5000" 
       : "https://YOUR-BACKEND-URL.onrender.com"; // ⚠️ You will replace this later!
   ```
3. Commit and push your latest code to your **GitHub repository**.

---

## 🧠 Phase 2: Deploy the Backend (Web Service)

Log in to [Render.com](https://render.com) and click **New + -> Web Service**.

1. Connect your GitHub repository here.
2. Fill out the service settings:
   - **Name:** `skinbiee-backend` (or whatever you prefer)
   - **Language:** `Python 3`
   - **Branch:** `main`
   - **Root Directory:** (leave blank)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python analysis_server.py`
3. Expand the **Environment Variables** section. You MUST copy the values exactly from your local `.env` file into Render:
   - `OPENROUTER_API_KEY` = `sk-or-v1-...`
   - `DATABASE_URL` = `postgresql://neondb_owner:...`
   - `CLOUDINARY_CLOUD_NAME` = `dzbyvsnh3`
   - `CLOUDINARY_API_KEY` = `[your key]`
   - `CLOUDINARY_API_SECRET` = `[your secret]`
4. Click **Create Web Service**. 
5. Wait for the build to finish. Once it says **Live**, copy the URL provided by Render (e.g., `https://skinbiee-backend-xyz.onrender.com`).

---

## 🎨 Phase 3: Connect Frontend to Backend

Now that your backend is alive on the internet, we need to tell the frontend where it is.

1. Go back to your local code, `frontend/skinbiee.js`.
2. Update Line 4 where it says `YOUR-BACKEND-URL.onrender.com` with the URL you *just copied* from Render.
   *(Make sure not to leave a trailing slash `/` at the end of the URL)*.
3. Commit this change and push to GitHub again.

---

## 📱 Phase 4: Deploy the Frontend (Static Site)

Go back to the Render dashboard and click **New + -> Static Site**.

1. Connect the same GitHub repository again.
2. Fill out the settings:
   - **Name:** `skinbiee-app`
   - **Branch:** `main`
   - **Publish directory:** `frontend` *(This tells Render to only serve your HTML/CSS/JS)*
   - **Build Command:** *(Leave blank, you don't need a build command for vanilla JS)*
3. Expand **Advanced**, and add a **Redirect/Rewrite Rule** (highly recommended so page refreshes don't break):
   - **Source:** `/*`
   - **Destination:** `/skinbiee.html`
   - **Action:** `Rewrite`
4. Click **Create Static Site**.

---

## 🎉 Phase 5: Go Live!
You are done! Render will give you a public URL for your Static Site (e.g., `https://skinbiee-app.onrender.com`). Click it, and you'll see your fully deployed masterpiece up and running on the internet!

### Why this architecture (Like a Real Dev)?
By separating your frontend (Static Site) from your backend (Web Service), you:
- **Save Money:** Static Sites are completely free on Render forever.
- **Boost Speed:** Render caches your frontend files across global CDNs.
- **Improve Security:** Your API keys and DB passwords live *only* on the backend server, completely hidden from users snooping in the browser.
