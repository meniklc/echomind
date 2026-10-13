"""Evaluation benchmark measuring retrieval precision, recall, and groundedness."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Set

from app.services.retrieval import retrieve_context

logger = logging.getLogger(__name__)

EVALUATION_DATASET: List[Dict[str, Any]] = [
    {
        "id": "q1_intro",
        "question": "Tell me about yourself.",
        "expected_sections": {"summary"},
        "expected_refs": {"summary"},
        "expected_keywords": ["medha nipuna", "b.tech", "cse"],
        "is_supported": True,
    },
    {
        "id": "q2_ai_learn",
        "question": "Explain my AI Learn internship and the work I did on the project.",
        "expected_sections": {"projects", "experience"},
        "expected_refs": {"ai-learn", "experience"},
        "expected_keywords": ["fastapi", "ocr", "tutor"],
        "is_supported": True,
    },
    {
        "id": "q3_phishcure",
        "question": "What is PhishCure and what problem did it solve?",
        "expected_sections": {"projects"},
        "expected_refs": {"phishcure"},
        "expected_keywords": ["phishing", "url", "classification"],
        "is_supported": True,
    },
    {
        "id": "q4_securalm",
        "question": "Tell me about SecuraLM and the technologies used in it.",
        "expected_sections": {"projects"},
        "expected_refs": {"securalm"},
        "expected_keywords": ["soc", "tinyllama", "chromadb"],
        "is_supported": True,
    },
    {
        "id": "q5_nexusops",
        "question": "What is NexusOps AI and what features does it have?",
        "expected_sections": {"projects"},
        "expected_refs": {"nexusops-ai"},
        "expected_keywords": ["enterprise", "permission", "rbac"],
        "is_supported": True,
    },
    {
        "id": "q6_cognix",
        "question": "Explain the CogniX project built during the hackathon.",
        "expected_sections": {"projects"},
        "expected_refs": {"cognix"},
        "expected_keywords": ["cognix", "career"],
        "is_supported": True,
    },
    {
        "id": "q7_covid",
        "question": "What is the COVID-19 prediction project repository?",
        "expected_sections": {"projects"},
        "expected_refs": {"covid19-prediction"},
        "expected_keywords": ["covid"],
        "is_supported": True,
    },
    {
        "id": "q8_bbms",
        "question": "What repository is associated with BBMS or HemoCloud?",
        "expected_sections": {"projects"},
        "expected_refs": {"bbms"},
        "expected_keywords": ["hemocloud"],
        "is_supported": True,
    },
    {
        "id": "q9_skills",
        "question": "What technologies and languages do you work with?",
        "expected_sections": {"skills"},
        "expected_refs": {"skills"},
        "expected_keywords": ["python", "fastapi", "machine learning"],
        "is_supported": True,
    },
    {
        "id": "q10_education",
        "question": "Where are you studying and what is your degree?",
        "expected_sections": {"education"},
        "expected_refs": {"education"},
        "expected_keywords": ["uvce", "bengaluru", "b.tech"],
        "is_supported": True,
    },
    {
        "id": "q11_apti_internship",
        "question": "What were your responsibilities at Apti Business Solutions?",
        "expected_sections": {"experience"},
        "expected_refs": {"experience"},
        "expected_keywords": ["apti", "ai/ml developer intern"],
        "is_supported": True,
    },
    {
        "id": "q12_skilldisk_internship",
        "question": "Tell me about your internship experience at SkillDisk.",
        "expected_sections": {"experience"},
        "expected_refs": {"experience"},
        "expected_keywords": ["skilldisk", "phishing"],
        "is_supported": True,
    },
    {
        "id": "q13_hid_apprenticeship",
        "question": "What is your role at HID Global?",
        "expected_sections": {"experience"},
        "expected_refs": {"experience"},
        "expected_keywords": ["hid global", "sde apprentice"],
        "is_supported": True,
    },
    {
        "id": "q14_career_goals",
        "question": "What are your career goals and future plans?",
        "expected_sections": {"career_goals"},
        "expected_refs": {"career_goals"},
        "expected_keywords": ["machine learning engineer"],
        "is_supported": True,
    },
    {
        "id": "q15_links",
        "question": "Where can I find your GitHub and LinkedIn profiles?",
        "expected_sections": {"links"},
        "expected_refs": {"links"},
        "expected_keywords": ["github.com/meniklc"],
        "is_supported": True,
    },
    {
        "id": "q16_unsupported_nobel",
        "question": "Did you win a Nobel Prize in Quantum Physics in 2024?",
        "expected_sections": set(),
        "expected_refs": set(),
        "expected_keywords": [],
        "is_supported": False,
    },
    {
        "id": "q17_unsupported_surgeon",
        "question": "Tell me about your surgical experience as a cardiac surgeon.",
        "expected_sections": set(),
        "expected_refs": set(),
        "expected_keywords": [],
        "is_supported": False,
    },
    {
        "id": "q18_unsupported_patent",
        "question": "Tell me about your 2023 patent on autonomous self-driving car engines.",
        "expected_sections": set(),
        "expected_refs": set(),
        "expected_keywords": [],
        "is_supported": False,
    },
]


def test_rag_evaluation_metrics() -> None:
    total_tp = 0
    total_fp = 0
    total_fn = 0
    unsupported_correct = 0
    unsupported_total = 0

    for item in EVALUATION_DATASET:
        question = item["question"]
        expected_refs: Set[str] = item["expected_refs"]
        is_supported: bool = item["is_supported"]

        context = retrieve_context(question)
        sections = context.get("sections", {})
        has_substantive = context.get("has_substantive_facts", False)
        references = context.get("references", [])

        # Extract retrieved reference keys (either project_id or section name)
        retrieved_keys: Set[str] = set()
        for ref in references:
            if ref.project_id:
                retrieved_keys.add(ref.project_id)
            elif ref.section:
                retrieved_keys.add(ref.section)

        if not is_supported:
            unsupported_total += 1
            if not has_substantive and len(retrieved_keys) == 0:
                unsupported_correct += 1
            continue

        # For supported questions, measure TP, FP, FN on reference relevance
        tp = len(retrieved_keys & expected_refs)
        fp = len(retrieved_keys - expected_refs)
        fn = len(expected_refs - retrieved_keys)

        total_tp += tp
        total_fp += fp
        total_fn += fn

        # Keyword verification in retrieved facts
        facts_blob = str(sections).lower()
        for kw in item["expected_keywords"]:
            assert kw in facts_blob, f"Expected keyword '{kw}' not found in retrieved facts for question: {question}"

    # Calculate metrics
    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    unsupported_detection_rate = unsupported_correct / unsupported_total if unsupported_total > 0 else 1.0

    print(f"\n[RAG Evaluation Results]")
    print(f"Retrieval Precision: {precision:.4f} ({total_tp}/{(total_tp + total_fp)})")
    print(f"Retrieval Recall:    {recall:.4f} ({total_tp}/{(total_tp + total_fn)})")
    print(f"Unsupported Fact Detection: {unsupported_detection_rate:.4f} ({unsupported_correct}/{unsupported_total})")

    # High-bar assertions
    assert precision >= 0.85, f"Precision was {precision:.2f}, expected >= 0.85"
    assert recall >= 0.90, f"Recall was {recall:.2f}, expected >= 0.90"
    assert unsupported_detection_rate == 1.0, f"Detection rate was {unsupported_detection_rate:.2f}, expected 1.0"
