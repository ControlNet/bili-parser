from dataclasses import dataclass

@dataclass
class Text:
    text: str

@dataclass
class Image:
    image_url: str

type Segment = Text | Image
