# Bilibili Video Info Parser

This is a web application designed to parse Bilibili video links, display detailed video information, and provide a formatted text output for easy copying.

It works on both web frontend and api endpoints.

## Developing

Once you've installed dependencies, start the SvelteKit development server:

```bash
npm run dev
```

By default, the application will be available at `http://localhost:5173`.

## Features

*   **User-Friendly Web Interface**: Easily fetch and view Bilibili video details through your browser.
*   **Bilibili Link Parsing**: Input any Bilibili video URL (even with extra text around it) to fetch video details.
*   **Comprehensive Information Display**: Shows video thumbnail, title, uploader name and fan count, detailed video statistics (views, danmaku, likes, coins, favorites, shares), video description, live viewer counts, and the cleaned video URL.
*   **Copy to Clipboard**: A button in the web interface to copy all displayed information in a pre-formatted text block.
*   **Backend API Endpoints**: Provides structured access to video data for programmatic use.

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
    GET http://localhost:5173/api/copy?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV17x411w7KC%2F
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
    https://www.bilibili.com/video/BV17x411w7KC
    ```
