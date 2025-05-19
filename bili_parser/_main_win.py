import io
import win32clipboard
from PIL import Image as PILImage
import requests
import base64
from .segment import Segment, Text, Image

# Constants for image resizing
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 10 MB
RESIZE_FACTOR = 0.8  # Reduce by 10% each time
MIN_DIMENSION = 100  # Don't resize image dimensions below this

def _prepare_cf_html(html_content: str) -> bytes:
    """
    Prepares HTML content for the clipboard according to CF_HTML standards.
    """
    version = "Version:0.9"
    start_html_offset_marker = "StartHTML:"
    end_html_offset_marker = "EndHTML:"
    start_fragment_offset_marker = "StartFragment:"
    end_fragment_offset_marker = "EndFragment:"

    html_fragment = "<!--StartFragment-->" + html_content + "<!--EndFragment-->"
    full_html = "<html><body>" + html_fragment + "</body></html>"

    # The header itself needs to be UTF-8 encoded to calculate its length accurately for offsets
    dummy_offset = "0000000000" # Used for length calculation of the header part
    full_html_utf8 = full_html.encode('utf-8')

    # Calculate the length of the header part up to the <html> tag
    # This requires knowing the exact byte length of the initial header part
    header_prefix_for_html_offset = (f"{version}\\r\\n"
                                     f"{start_html_offset_marker}{dummy_offset}\\r\\n"
                                     f"{end_html_offset_marker}{dummy_offset}\\r\\n"
                                     f"{start_fragment_offset_marker}{dummy_offset}\\r\\n"
                                     f"{end_fragment_offset_marker}{dummy_offset}\\r\\n")
    
    start_html_offset = len(header_prefix_for_html_offset.encode('utf-8'))
    end_html_offset = start_html_offset + len(full_html_utf8)
    
    start_fragment_offset = start_html_offset + full_html_utf8.find(b"<!--StartFragment-->")
    end_fragment_offset = start_html_offset + full_html_utf8.find(b"<!--EndFragment-->") + len(b"<!--EndFragment-->")

    # Reconstruct header with correct offsets (zero-padded to 10 digits)
    header = (f"{version}\\r\\n"
              f"{start_html_offset_marker}{start_html_offset:010d}\\r\\n"
              f"{end_html_offset_marker}{end_html_offset:010d}\\r\\n"
              f"{start_fragment_offset_marker}{start_fragment_offset:010d}\\r\\n"
              f"{end_fragment_offset_marker}{end_fragment_offset:010d}\\r\\n").encode('utf-8')

    return header + full_html_utf8


def load_image(image_url: str) -> str:
    """
    Loads an image from a URL, resizes it if it's too large (PNG size > 10MB),
    and returns it as a base64 encoded PNG data URI.
    Returns an empty string on failure.
    """
    try:
        response = requests.get(image_url, stream=True, timeout=10) # Added timeout
        response.raise_for_status()
        
        image_data_bytes = response.raw.read()

        img = PILImage.open(io.BytesIO(image_data_bytes))
        
        # Convert to RGBA to handle transparency if any, before saving as PNG
        if img.mode not in ('RGB', 'RGBA'):
             img = img.convert('RGBA')
        elif img.mode == 'P': # Palette mode, common in GIFs
             img = img.convert('RGBA')


        output_png_buffer = io.BytesIO()
        img.save(output_png_buffer, format="PNG")
        png_data = output_png_buffer.getvalue()

        current_width, current_height = img.size

        while len(png_data) > MAX_IMAGE_SIZE_BYTES and \
              current_width * RESIZE_FACTOR >= MIN_DIMENSION and \
              current_height * RESIZE_FACTOR >= MIN_DIMENSION:
            
            print(f"Image from {image_url} is too large ({len(png_data)/(1024*1024):.2f} MB). Resizing...")
            
            current_width = int(current_width * RESIZE_FACTOR)
            current_height = int(current_height * RESIZE_FACTOR)
            
            resized_img = img.resize((current_width, current_height), PILImage.Resampling.LANCZOS)
            
            output_png_buffer.seek(0)
            output_png_buffer.truncate()
            resized_img.save(output_png_buffer, format="PNG")
            png_data = output_png_buffer.getvalue()
            print(f"Resized to {current_width}x{current_height}, new PNG size: {len(png_data)/(1024*1024):.2f} MB")

        if len(png_data) > MAX_IMAGE_SIZE_BYTES:
            print(f"Warning: Image from {image_url} still too large ({len(png_data)/(1024*1024):.2f} MB) after resizing. Proceeding.")

        base64_image = base64.b64encode(png_data).decode('utf-8')
        return f"data:image/png;base64,{base64_image}"

    except requests.exceptions.RequestException as e:
        print(f"Error fetching image for load_image from URL: {image_url}\\n{e}")
        return ""
    except PILImage.UnidentifiedImageError:
        print(f"Error: Cannot identify image file from URL (Pillow): {image_url}")
        return ""
    except IOError as e: 
        print(f"Error processing image with Pillow for URL {image_url}: {e}")
        return ""
    except Exception as e: 
        print(f"An unexpected error occurred in load_image for URL {image_url}: {e}")
        return ""


def set_clipboard_text_and_image(*segments: list[Segment]):
    try:
        html_contents = []
        for segment in segments:
            match segment:
                case Text(text):
                    # Sanitize text for HTML: replace newlines with <br>, escape HTML special chars if necessary
                    # For now, just simple paragraph, assuming text is relatively clean.
                    processed_text = text.strip().replace("\\n", "<br>") 
                    html_contents.append(f'<p>{processed_text}</p>')
                case Image(image_url_from_segment):
                    loaded_image_src = load_image(image_url_from_segment)
                    if loaded_image_src:
                        html_contents.append(f'<img src="{loaded_image_src}" />')
                    else:
                        print(f"Skipping image segment due to loading error from URL: {image_url_from_segment}")
        
        if not html_contents:
            print("No content to copy to clipboard.")
            return

        html_content = "".join(html_contents)

        cf_html_data = _prepare_cf_html(html_content)
        cf_html_format = win32clipboard.RegisterClipboardFormat("HTML Format")

        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(cf_html_format, cf_html_data)
            print("Content successfully copied to clipboard as HTML.")
        finally:
            win32clipboard.CloseClipboard()
    except Exception as e:
        print(f"An unexpected error occurred in set_clipboard_text_and_image: {e}")
