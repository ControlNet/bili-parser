# based on the OS to load the corresponding module
import platform
from .segment import Text, Image
import pyperclip
import requests
import re
import json


if platform.system() == "Windows":
    from ._main_win import set_clipboard_text_and_image
else:
    raise NotImplementedError(f"Unsupported OS: {platform.system()}")


def load_clipboard() -> str:
    return pyperclip.paste()

# --- Helper Functions ---
def format_number(num: int | str) -> str:
    if type(num) == str:
        return num
    if num >= 10000:
        return f"{(num / 10000):.1f}万"
    return str(num)

def extract_bvid_from_url(url: str) -> str | None:
    if not url:
        return None
    bvid_match = re.search(r"BV([a-zA-Z0-9]+)", url)
    if bvid_match:
        return bvid_match.group(0) # Return the full BV ID, e.g., "BV1QL411M7r3"
    return None

def resolve_b23_url(short_url_input: str) -> str | None:
    target_b23_url = short_url_input
    if not target_b23_url.startswith("http"):
        target_b23_url = "https://" + target_b23_url
    
    if "b23.tv/" not in target_b23_url:
        # If it doesn't look like a b23.tv link that needs resolution, return it as is.
        # The main parser will try to extract BVID or handle it.
        return short_url_input 

    try:
        # Standard headers to mimic a browser
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(target_b23_url, headers=headers, allow_redirects=False, timeout=5)
        if response.status_code in [301, 302]:
            location = response.headers.get('Location')
            if location:
                # Clean the URL: remove query parameters and trailing slash
                query_index = location.find('?')
                if query_index != -1:
                    location = location[:query_index]
                if location.endswith('/'):
                    location = location[:-1]
                return location
            else:
                print(f"Warning: b23.tv redirect for {target_b23_url} missing Location header.")
                return None
        else:
            print(f"Warning: b23.tv did not redirect for {target_b23_url}. Status: {response.status_code}")
            return None # Or short_url_input if we want to try parsing it directly
    except requests.RequestException as e:
        print(f"Error resolving b23.tv link {target_b23_url}: {e}")
        return None

# --- Main Parsing Logic ---

def parse_bili(url_input: str) -> str:
    processed_url = url_input

    # Step 1: Resolve b23.tv link if applicable
    # Heuristic to detect b23.tv links or short codes
    if "b23.tv/" in url_input or (not url_input.startswith("BV") and not "bilibili.com" in url_input and len(url_input) < 15 and re.match(r"^[a-zA-Z0-9]+$", url_input)):
        potential_b23_url = url_input
        if "b23.tv/" not in url_input:
             potential_b23_url = f"https://b23.tv/{url_input}" # Assume short codes are for b23.tv
        
        print(f"Attempting to resolve short link: {potential_b23_url}")
        resolved = resolve_b23_url(potential_b23_url)
        if resolved:
            processed_url = resolved
            print(f"Resolved to: {processed_url}")
        elif "b23.tv/" in potential_b23_url: # Only fail if it definitely looked like a b23 link
            return f"Error: Failed to resolve b23.tv short link: {potential_b23_url}"
        # If not resolved and not definitely a b23 link, proceed with original input

    # Step 2: Extract BVID
    bvid = extract_bvid_from_url(processed_url)
    if not bvid:
        return f"Error: Could not extract BVID from URL: {processed_url} (original input: {url_input})"

    print(f"Extracted BVID: {bvid}")

    # Step 3: Fetch data from Bilibili APIs
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
    }

    video_info = {
        'title': 'N/A',
        'upName': 'N/A',
        'upMid': None,
        'upFans': 'N/A',
        'pic': 'N/A', # We won't include pic in the final string, but useful to have
        'views': 'N/A',
        'danmaku': 'N/A',
        'likes': 'N/A',
        'coins': 'N/A',
        'favorites': 'N/A',
        'shares': 'N/A',
        'description': 'N/A',
        'watchingTotal': 'N/A',
        'watchingWeb': 'N/A',
        'cleanedUrl': f"https://www.bilibili.com/video/{bvid}",
        'cid': None,
        'bvid': bvid
    }

    try:
        # 1. Get video details
        view_api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        print(f"Fetching main info: {view_api_url}")
        resp_view = requests.get(view_api_url, headers=headers, timeout=5)
        resp_view.raise_for_status()
        view_data = resp_view.json()

        if view_data.get('code') == 0:
            data = view_data.get('data', {})
            stat = data.get('stat', {})
            video_info['title'] = data.get('title', 'N/A')
            video_info['description'] = data.get('desc', 'N/A')
            video_info['pic'] = data.get('pic', 'N/A')
            video_info['upName'] = data.get('owner', {}).get('name', 'N/A')
            video_info['upMid'] = data.get('owner', {}).get('mid')
            video_info['cid'] = data.get('cid')
            video_info['views'] = format_number(stat.get('view', 0))
            video_info['danmaku'] = format_number(stat.get('danmaku', 0))
            video_info['likes'] = format_number(stat.get('like', 0))
            video_info['coins'] = format_number(stat.get('coin', 0))
            video_info['favorites'] = format_number(stat.get('favorite', 0))
            video_info['shares'] = format_number(stat.get('share', 0))
        else:
            print(f"Warning: View API error for {bvid} - {view_data.get('message', 'Unknown error')}")

        # 2. Get UP fan count
        if video_info['upMid']:
            relation_api_url = f"https://api.bilibili.com/x/relation/stat?vmid={video_info['upMid']}"
            print(f"Fetching fan count: {relation_api_url}")
            resp_relation = requests.get(relation_api_url, headers=headers, timeout=5)
            resp_relation.raise_for_status()
            relation_data = resp_relation.json()
            if relation_data.get('code') == 0:
                video_info['upFans'] = format_number(relation_data.get('data', {}).get('follower', 0))
            else:
                print(f"Warning: Relation API error for mid {video_info['upMid']} - {relation_data.get('message')}")

        # 3. Get online viewers
        if video_info['cid']:
            online_api_url = f"https://api.bilibili.com/x/player/online/total?bvid={bvid}&cid={video_info['cid']}"
            print(f"Fetching online count: {online_api_url}")
            resp_online = requests.get(online_api_url, headers=headers, timeout=5)
            resp_online.raise_for_status()
            online_data = resp_online.json()
            if online_data.get('code') == 0 and online_data.get('data'):
                video_info['watchingTotal'] = format_number(online_data['data'].get('total', 0))
                video_info['watchingWeb'] = format_number(online_data['data'].get('web_online', 0)) if online_data['data'].get('web_online') is not None else (format_number(online_data['data'].get('count', 0)) if online_data['data'].get('count') is not None else 'N/A')
            else:
                 print(f"Warning: Online API error for bvid {bvid} - {online_data.get('message')}")

    except requests.RequestException as e:
        return f"Error: Network request failed during API call - {e}"
    except json.JSONDecodeError as e:
        return f"Error: Failed to decode JSON response from API - {e}"
    except Exception as e:
        return f"Error: An unexpected error occurred - {e}"

    # Step 4: Format the output string
    up_fans_text = f" 粉丝: {video_info['upFans']}" if video_info['upFans'] not in ['N/A', '0'] else ''
    
    watching_web_text = f"，{video_info['watchingWeb']} 人在网页端观看" if video_info['watchingWeb'] not in ['N/A', '0'] else ''
    watching_total_text = f"🏄‍♂️ 总共 {video_info['watchingTotal']} 人在观看{watching_web_text}" if video_info['watchingTotal'] not in ['N/A', '0'] else ''

    # Removing pic from the output string as per previous decision
    text_to_copy_1 = f"""标题: {video_info['title']}
UP主: {video_info['upName']}{up_fans_text}""".strip()
    text_to_copy_2 = f"""👀播放: {video_info['views']} 💬弹幕: {video_info['danmaku']}
👍点赞: {video_info['likes']} 💰投币: {video_info['coins']}
📁收藏: {video_info['favorites']} 🔗分享: {video_info['shares']}
📝简介: {video_info['description'] or '无'}
{watching_total_text}
{video_info['cleanedUrl']}""".strip()
    image_to_copy = video_info['pic']

    return (
        Text(text_to_copy_1),
        Image(image_to_copy),
        Text(text_to_copy_2)
    )


if __name__ == "__main__":
    set_clipboard_text_and_image(
        *parse_bili(load_clipboard())
    )
