import requests
from bs4 import BeautifulSoup
import re

def search_images(keyword, limit=10):
    url = f"https://www.bing.com/images/search?q={keyword}&first=1"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, "html.parser")

    image_urls = []
    for img in soup.find_all("img", class_="mimg"):
        if img.has_attr("src"):
            image_urls.append(img["src"])
        elif img.has_attr("data-src"):
            image_urls.append(img["data-src"])
        if len(image_urls) >= limit:
            break

    return image_urls

def download_image(url, path):
    response = requests.get(url)
    with open(path, "wb") as f:
        f.write(response.content)

if __name__ == "__main__":
    keyword = "大地之子 瓜州"
    image_urls = search_images(keyword, limit=3)
    print(f"Found {len(image_urls)} images for '{keyword}'")

    for i, url in enumerate(image_urls):
        try:
            print(f"Downloading image {i+1}: {url}")
            download_image(url, f"/tmp/earthSon{i+1}.jpg")
        except Exception as e:
            print(f"Error downloading image {i+1}: {e}")
