# Bilibili Video Info Parser

This is a web application designed to parse Bilibili video links, display detailed video information, and provide a formatted text output for easy copying. It also includes automatic subtitle generation using AI-powered speech recognition.

It works on both web frontend and api endpoints.

## Setup

### Environment Variables

Copy `.env.example` to `.env` and configure the required variables:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `WHISPER_ASR_URL`: URL of your Whisper ASR service for subtitle generation

### Developing

```bash
npm install
npm run dev
```

## Web Interface

Visit `http://localhost:5173` in your browser.

## API Endpoints

The application provides the following API endpoints for programmatic access to video information.

### 1. Get Parsed Video Information (JSON)

*   **Endpoint**: `/api/parse`
*   **Method**: `GET`
*   **Purpose**: Retrieves detailed video information as a JSON object.
*   **Query Parameter**:
    *   `url` (required): The Bilibili video URL or text containing the URL (e.g., `https://www.bilibili.com/video/BVxxxxxx` or `Check this out: https://www.bilibili.com/video/BVxxxxxx some text`). Remember to URL-encode this parameter if it contains special characters.
*   **Example Request**:
    ```
    GET http://localhost:5173/api/parse?url=BVxxxxx
    ```
*   **Example Success Response (JSON)**:
    ```json
    {
      "title": "示例视频标题",
      "upName": "示例UP主",
      "upMid": "123456",
      "upFans": "10.5万",
      "pic": "https://i0.hdslb.com/bfs/cover/xxxxxxxx.jpg",
      "views": "100万",
      "danmaku": "1万",
      "likes": "5000",
      "coins": "2000",
      "favorites": "1000",
      "shares": "500",
      "description": "这是一段视频简介...",
      "watchingTotal": "1000",
      "watchingWeb": "800",
      "cleanedUrl": "https://www.bilibili.com/video/BVxxxxx",
      "cid": "789012",
      "bvid": "BVxxxxx"
    }
    ```

### 2. Get Formatted Text for Copying

*   **Endpoint**: `/api/copy`
*   **Method**: `GET`
*   **Purpose**: Retrieves a pre-formatted plain text string of the video information, suitable for direct copying.
*   **Query Parameter**:
    *   `url` (required): The Bilibili video URL or text containing the URL. Remember to URL-encode this parameter.
*   **Example Request**:
    ```
    GET http://localhost:5173/api/copy?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBVxxxxx
    ```
*   **Example Success Response (Plain Text)**:
    ```text
    标题: 示例视频标题
    UP主: 示例UP主 粉丝: 10.5万
    https://i0.hdslb.com/bfs/cover/xxxxxxxx.jpg
    👀播放: 100万 💬弹幕: 1万
    👍点赞: 5000 💰投币: 2000
    📁收藏: 1000 🔗分享: 500
    📝简介: 这是一段视频简介...
    🏄‍♂️ 总共 1000 人在观看，800 人在网页端观看
    https://www.bilibili.com/video/BVxxxxx
    ```

### 3. Generate Subtitles

*   **Endpoint**: `/api/subtitles`
*   **Method**: `POST`
*   **Purpose**: Generates AI-powered subtitles from video audio using Whisper ASR.
*   **Request Body (JSON)**:
    ```json
    {
      "bvid": "BVxxxxx",
      "cid": "xxxxxx"
    }
    ```
*   **Example Success Response (JSON)**:
    ```json
    {
      "success": true,
      "audioUrl": "https://...",
      "subtitles": {
        "text": "Complete transcript text here...",
        "segments": [
          {
            "start": 0.0,
            "end": 3.5,
            "text": "Hello, welcome to this video",
          }
        ]
      }
    }
    ```

**Note**: This endpoint requires a configured Whisper ASR service URL in the environment variables.
