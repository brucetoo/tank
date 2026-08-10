import requests

def download_image(url, file_path):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://claude.ai/",
    }

    try:
        response = requests.get(url, headers=headers, stream=True)
        response.raise_for_status()

        with open(file_path, 'wb') as file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file.write(chunk)

        print(f"Image downloaded successfully to: {file_path}")
        print(f"File size: {response.headers.get('content-length', 'Unknown')} bytes")
        print(f"Content type: {response.headers.get('content-type', 'Unknown')}")

    except requests.exceptions.RequestException as e:
        print(f"Error downloading image: {e}")

if __name__ == "__main__":
    url = "https://claude.ai/api/images/8"
    file_path = "/tmp/earthSon-new.jpg"
    download_image(url, file_path)
