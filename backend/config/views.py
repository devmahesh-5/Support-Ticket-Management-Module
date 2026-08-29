from django.conf import settings
from django.http import HttpResponse


def healthz(request):
    return HttpResponse("ok", content_type="text/plain")


def frontend_index(request, path=""):
    index = settings.FRONTEND_BUILD_DIR / "index.html"
    if not index.is_file():
        return HttpResponse("Frontend not built", status=503, content_type="text/plain")
    with index.open("rb") as f:
        return HttpResponse(f.read(), content_type="text/html")