# Running the Application

This project contains two ways to run the app depending on what you're working on.

## 1. Run the Main App (Streamlit)

The main application includes the backend logic, models, and comprehensive UI.

### Prerequisites
Ensure you have the dependencies installed:
```powershell
pip install -r requirements.txt
```

### Run Command
```powershell
streamlit run app.py
```
This will open the app in your browser (usually at `http://localhost:8501`).

---

### Run Commands (Dual-Server Setup)

To use the new **AI Analyzer** and **Product Scanner**, you must run both the backend and the frontend:

#### Step 1: Start the AI Backend
```powershell
python analysis_server.py
```
This starts the inference engine on `http://localhost:5000`.

#### Step 2: Start the Frontend
```powershell
python serve_skinbiee.py
```
This serves the UI on `http://localhost:8001`.

### Accessing the UI
- **Skinbiee App:** [http://localhost:8001/skinbiee.html](http://localhost:8001/skinbiee.html)
- **Main Home:** [http://localhost:8001/index.html](http://localhost:8001/index.html)

---

## Troubleshooting

### "Fatal error in launcher: find the file specified"
This error usually occurs if the `venv` folder was moved or renamed. The current `venv` has hardcoded paths to a different directory.

#### Fix: Recreate the Virtual Environment
1.  **Delete** the existing `venv` folder.
2.  **Recreate** it:
    ```powershell
    python -m venv venv
    ```
3.  **Activate** it:
    - **Windows:** `.\venv\Scripts\activate`
    - **Mac/Linux:** `source venv/bin/activate`
4.  **Reinstall dependencies:**
    ```powershell
    pip install -r requirements.txt
    ```

### Standalone Frontend not loading
Make sure you are running the script from the **root** of the project (`skincare/`) and not from inside the `frontend/` folder, as `serve_skinbiee.py` handles the directory change itself.
