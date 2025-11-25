from typing_extensions import Annotated
from pydantic import BaseModel, Field, StringConstraints, HttpUrl


class ChatRequest(BaseModel):
    message: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, strict=True, min_length=1, max_length=4000
        ),
    ]
    url: Annotated[HttpUrl, Field(description="A valid HTTP/HTTPS URL only.")]


class IngestRequest(BaseModel):
    url: Annotated[HttpUrl, Field(description="A valid HTTP/HTTPS URL only.")]
