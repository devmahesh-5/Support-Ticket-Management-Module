from accounts.models import User
from .models import CategorySla

CATEGORIES = {
    "Lab Equipment": {
        "slug": "lab-equipment",
        "description": "Lab hardware, equipment, projector issues",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": None,
        "staff_type": User.StaffType.LAB,
    },
    "Classroom": {
        "slug": "classroom",
        "description": "Classroom, teaching aid, whiteboard issues",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": None,
        "staff_type": User.StaffType.TEACHER,
    },
    "Network / Internet": {
        "slug": "network-internet",
        "description": "Campus internet, WiFi, network issues",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "CIT",
        "staff_type": User.StaffType.IT,
    },
    "Financial / Fees": {
        "slug": "financial-fees",
        "description": "Payments, scholarships, refunds, fees",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "FIN",
        "staff_type": User.StaffType.FINANCE,
    },
    "Academic": {
        "slug": "academic",
        "description": "Grades, registration, transcripts, exams",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "ACA",
        "staff_type": User.StaffType.ACADEMIC,
    },
    "Library": {
        "slug": "library",
        "description": "Library services, book issues",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "LIB",
        "staff_type": User.StaffType.LIBRARY,
    },
    "Hostel / Facilities": {
        "slug": "hostel-facilities",
        "description": "Hostel, accommodation, maintenance",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "FAC",
        "staff_type": User.StaffType.FACILITIES,
    },
    "General / Other": {
        "slug": "general-other",
        "description": "Other issues",
        "sla_response_hours": 24,
        "sla_resolution_hours": 72,
        "target_dept": "HOD",
        "staff_type": None,
    },
}

CATEGORY_NAMES = list(CATEGORIES.keys())
CATEGORY_BY_SLUG = {info["slug"]: name for name, info in CATEGORIES.items()}


def get_category_route(category_name):
    """Resolve a category name to its routing target.

    Returns {"target_dept": <dept code or None>, "staff_type": ...} or None.
    """
    if not category_name:
        return None
    info = CATEGORIES.get(category_name)
    if not info:
        return None
    return {
        "target_dept": info.get("target_dept"),
        "staff_type": info.get("staff_type"),
    }


def get_category_sla(name):
    """Effective SLA hours for a category.

    Returns (sla_response_hours, sla_resolution_hours). Uses the
    admin-configured DB override when present, otherwise the hardcoded default.
    """
    defaults = CATEGORIES.get(name) or {}
    resp = defaults.get("sla_response_hours", 24)
    res = defaults.get("sla_resolution_hours", 72)
    if name:
        try:
            row = CategorySla.objects.get(category=name)
            resp, res = row.sla_response_hours, row.sla_resolution_hours
        except CategorySla.DoesNotExist:
            pass
    return resp, res


def category_dict(name):
    """Serializable representation of a hardcoded category (API response)."""
    info = CATEGORIES.get(name) or {}
    route = get_category_route(name)
    resp_hours, res_hours = get_category_sla(name)
    return {
        "id": name,
        "slug": info.get("slug", name),
        "name": name,
        "description": info.get("description", ""),
        "sla_response_hours": resp_hours,
        "sla_resolution_hours": res_hours,
        "target_department": route["target_dept"] if route else None,
    }
