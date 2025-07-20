# main.py
import os
import json
from typing import List
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Libraries pour lire les fichiers ---
import PyPDF2
import docx

# 1. CONFIGURATION
# =============================================
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY non trouvée dans le fichier .env")
genai.configure(api_key=api_key)

app = FastAPI(
    title="API d'Analyse de CV",
    description="Une API pour analyser la compatibilité de CVs avec une offre d'emploi en utilisant Gemini."
)

# Configuration CORS pour autoriser les requêtes du frontend (React)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # L'URL de votre app React en dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. PROMPTS POUR L'IA
# =============================================
JOB_DESCRIPTION_PROMPT = """
Analyse le texte de cette offre d'emploi et extrais les informations suivantes.
Retourne UNIQUEMENT un objet JSON valide avec les clés suivantes : "skills" (une liste de compétences techniques et non-techniques clés), "experience_years" (un entier représentant le nombre d'années d'expérience minimum), et "diploma" (une chaîne de caractères décrivant le diplôme requis).

Texte de l'offre :
{text}
"""

CV_PROMPT = """
Analyse le texte de ce CV et extrais les informations suivantes.
Retourne UNIQUEMENT un objet JSON valide avec les clés suivantes : "name" (le nom complet du candidat), "skills" (une liste de ses compétences), "experience_years" (un entier représentant son nombre total d'années d'expérience), et "diploma" (une chaîne de caractères décrivant son plus haut diplôme).

Texte du CV :
{text}
"""

SUMMARY_PROMPT = """
En te basant sur l'offre d'emploi et le CV suivants, rédige un résumé concis de 3 phrases pour un recruteur.
Mets en avant les points forts du candidat par rapport à l'offre et justifie pourquoi il est pertinent.

Offre d'emploi : {job_description}
---
CV : {cv_text}
"""

# 3. FONCTIONS UTILITAIRES
# =============================================
def extract_text_from_file(file: UploadFile) -> str:
    """Extrait le texte brut d'un fichier PDF ou DOCX."""
    text = ""
    if file.filename.endswith(".pdf"):
        reader = PyPDF2.PdfReader(file.file)
        for page in reader.pages:
            text += page.extract_text() or ""
    elif file.filename.endswith(".docx"):
        doc = docx.Document(file.file)
        for para in doc.paragraphs:
            text += para.text + "\n"
    else:
        # Pour les .txt ou autres formats simples
        text = file.file.read().decode("utf-8")
    return text

def calculate_score(job_data: dict, cv_data: dict) -> dict:
    """Calcule un score de compatibilité pondéré."""
    score = 0
    details = {}

    # Score des compétences (60% du total)
    job_skills = set(s.lower() for s in job_data.get("skills", []))
    cv_skills = set(s.lower() for s in cv_data.get("skills", []))
    common_skills = job_skills.intersection(cv_skills)
    skill_score = (len(common_skills) / len(job_skills)) * 100 if job_skills else 0
    score += skill_score * 0.6
    details["skill_match"] = f"{int(skill_score)}% ({len(common_skills)}/{len(job_skills)} compétences)"
    details["common_skills"] = list(common_skills)


    # Score de l'expérience (30% du total)
    job_exp = job_data.get("experience_years", 0)
    cv_exp = cv_data.get("experience_years", 0)
    exp_score = min((cv_exp / job_exp) * 100, 100) if job_exp > 0 else 100
    score += exp_score * 0.3
    details["experience_match"] = f"{cv_exp} ans vs {job_exp} requis"

    # Score du diplôme (10% du total)
    # C'est une vérification simple, pourrait être améliorée par l'IA
    job_diploma = job_data.get("diploma", "").lower()
    cv_diploma = cv_data.get("diploma", "").lower()
    diploma_score = 100 if any(word in cv_diploma for word in job_diploma.split() if len(word) > 3) else 0
    score += diploma_score * 0.1
    details["diploma_match"] = "Correspond" if diploma_score == 100 else "Ne correspond pas"

    return {"total_score": int(score), "details": details}

async def call_gemini_api(prompt: str) -> dict:
    """Appelle l'API Gemini et parse la réponse JSON."""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        response = await model.generate_content_async(prompt)
        # Nettoyage pour extraire le JSON
        json_text = response.text.strip().replace("```json", "").replace("```", "")
        return json.loads(json_text)
    except (json.JSONDecodeError, Exception) as e:
        print(f"Erreur API Gemini ou parsing JSON : {e}")
        # Retourne une structure vide en cas d'erreur pour ne pas bloquer le flux
        return {}


# 4. ENDPOINT API PRINCIPAL
# =============================================
@app.post("/analyze/")
async def analyze_cvs(
    job_description: str = Form(...),
    cvs: List[UploadFile] = File(...)
):
    """
    Endpoint principal qui analyse les CVs par rapport à une offre d'emploi.
    """
    print("Analyse de l'offre d'emploi...")
    job_data = await call_gemini_api(JOB_DESCRIPTION_PROMPT.format(text=job_description))
    if not job_data:
        raise HTTPException(status_code=500, detail="Impossible d'analyser l'offre d'emploi.")

    results = []

    for cv_file in cvs:
        print(f"Analyse du CV : {cv_file.filename}...")
        cv_text = extract_text_from_file(cv_file)
        if not cv_text:
            continue

        cv_data = await call_gemini_api(CV_PROMPT.format(text=cv_text))
        if not cv_data:
            continue

        # Calcul du score
        score_data = calculate_score(job_data, cv_data)

        # Génération du résumé IA
        summary_model = genai.GenerativeModel('gemini-1.5-flash-latest')
        summary_prompt_text = SUMMARY_PROMPT.format(job_description=job_description, cv_text=cv_text)
        summary_response = await summary_model.generate_content_async(summary_prompt_text)
        
        results.append({
            "candidate_name": cv_data.get("name", "Inconnu"),
            "filename": cv_file.filename,
            "score": score_data["total_score"],
            "summary": summary_response.text,
            "details": score_data["details"]
        })

    # Trier les résultats par score décroissant
    sorted_results = sorted(results, key=lambda x: x["score"], reverse=True)
    return sorted_results