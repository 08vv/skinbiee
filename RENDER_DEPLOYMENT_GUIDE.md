# 🚀 The Ultimate Skinbiee Deployment Guide (Render)

Welcome to the production deployment guide! Since you are new to this, don't worry—this guide covers **every single detail** step-by-step. 

Deploying a real app means we have to securely connect three major pieces:
1. **The Database** (PostgreSQL / Neon) - *Where your users and scans are saved.*
2. **The Cloud Storage** (Cloudinary) - *Where your photos are saved.*
3. **The AI Brain** (OpenRouter) - *What reads the ingredients.*

We will deploy this in two parts to keep it professional and free:
- **Phase A:** Deploying the Backend (The engine of your app).
- **Phase B:** Deploying the Frontend (The beautiful website users see).

---

## 🛑 Phase 1: Prepare the Codebase for Production

Right now, your frontend (`skinbiee.js`) is hardcoded to look for the backend on your own computer (`http://localhost:5000`). We need to tell it to use the new cloud server *only when it's online*.

*(Note: We already changed this for you in the code! Just make sure your latest code is pushed to GitHub. Based on the logs, your code is safely pushed to `main`!)*

---

## 🧠 Phase 2: Deploy the Backend & Connect the Databases

Your backend is the `analysis_server.py` file. It needs to know how to talk to Cloudinary and Neon PostgreSQL. We do this using **Environment Variables** (the secrets stored in your `.env` file locally).

### Step 1: Create the Web Service
Log in to [Render.com](https://render.com) and click **New + -> Web Service**.

1. **Connect your GitHub repository** (`08vv/skinbiee`).
2. Fill out the service settings exactly like this:
   - **Name:** `skinbiee-backend`
   - **Region:** Choose whatever is closest to you.
   - **Branch:** `main`
   - **Root Directory:** *(leave this blank)*
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python analysis_server.py`
   - **Instance Type:** Free Tier (if available) or exactly what you choose.

### Step 2: Add Your Cloud & Database Secrets
Now scroll down and expand the **Environment Variables** section. Click "Add Environment Variable" multiple times to add the following exactly as they appear in your local project's `.env` file:

> **HOW TO FIND THESE:** Open the `.env` file in your code editor locally. Copy the values (the text after the `=` sign) and paste them into Render.

1. **Database (Neon PostgreSQL):**
   - **Key:** `DATABASE_URL`
   - **Value:** `postgresql://neondb_owner:...` *(Copy this heavy link from your `.env` file)*
   > *Pro Tip: This tells Render exactly where your Neon database lives on the internet so it can save user routines.*

2. **Cloud Storage (Cloudinary):**
   - **Key:** `CLOUDINARY_CLOUD_NAME`
   - **Value:** `dzbyvsnh3`
   - **Key:** `CLOUDINARY_API_KEY`
   - **Value:** *(Copy the 15-digit number from your `.env`)*
   - **Key:** `CLOUDINARY_API_SECRET`
   - **Value:** *(Copy the secret string from your `.env`)*
   > *Pro Tip: This tells Render how to securely upload user selfies to your Cloudinary dashboard.*

3. **AI Brain (OpenRouter):**
   - **Key:** `OPENROUTER_API_KEY`
   - **Value:** `sk-or-v1-...` *(Copy from `.env`)*

### Step 3: Launch It!
1. Click **Create Web Service** at the bottom.
2. Wait a few minutes. You will see a terminal log building the app. 
3. Wait until the top-left status turns to a green **Live**.
4. **Important:** Copy the public URL Render gives you near the top of the page (it will look like `https://skinbiee-backend-xyz.onrender.com`).

---

## 🎨 Phase 3: Connect Frontend to Backend

Now that your backend is alive on the internet, we need to tell your frontend where to send the data.

1. Go back to your local code and open `frontend/skinbiee.js`.
2. Look at **Line 4**, it currently says:
   `"https://YOUR-BACKEND-URL-HERE.onrender.com";`
3. Delete that placeholder and paste the URL you *just copied* from Render. 
   *(Make sure there is NO trailing slash `/` at the very end of the URL)*.
4. **Push to GitHub!** Run these commands:
   - `git add .`
   - `git commit -m "added render backend URL"`
   - `git push origin main`

---

## 📱 Phase 4: Deploy the Frontend (The Website)

Now we deploy the actual user interface. Go back to the Render dashboard and click **New + -> Static Site**.

1. Connect the same GitHub repository again (`08vv/skinbiee`).
2. Fill out the settings:
   - **Name:** `skinbiee-app`
   - **Branch:** `main`
   - **Publish directory:** `frontend` *(This is crucial! It tells Render to only use the frontend folder.)*
   - **Build Command:** *(Leave this completely blank)*
3. **Scroll down to "Advanced"** and expand it. Click "Add Rewrite Rule":
   - **Source:** `/*`
   - **Destination:** `/skinbiee.html`
   - **Action:** `Rewrite`
   > *Pro Tip: This ensures if someone refreshes the page, they don't get a 404 error.*
4. Click **Create Static Site**.

---

## 🎉 Phase 5: You Are Live!
You are done! Render will give you a public URL for your Static Site (e.g., `https://skinbiee-app.onrender.com`). 

Click that link! Your beautiful UI will load instantly. When you scan a product or save a routine, the frontend will talk to your Render backend, securely push the image to Cloudinary, save the text in PostgreSQL Neon, and return the magic result smoothly onto the screen.

**You are now officially a Full-Stack Developer!**
