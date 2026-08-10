import requests
from bs4 import BeautifulSoup

# 访问地图页面
url = 'http://localhost:5179'
response = requests.get(url)
response.encoding = 'utf-8'

# 解析 HTML 内容
soup = BeautifulSoup(response.text, 'html.parser')

# 检查地图容器
map_shell = soup.find('div', class_='map-shell')
if map_shell:
    print('✅ 地图容器已找到')
    # 检查地图画布
    map_canvas = map_shell.find('div', class_='map-canvas')
    if map_canvas:
        print('✅ 地图画布已找到')

# 检查地图控件
map_controls = soup.find_all('div', class_='maplibregl-ctrl')
if map_controls:
    print(f'✅ 找到 {len(map_controls)} 个地图控件')

# 检查是否有地图瓦片加载
map_tiles = soup.find_all('img', class_='maplibregl-tile')
if map_tiles:
    print(f'✅ 已加载 {len(map_tiles)} 个地图瓦片')

# 检查是否有路线数据
route_elements = soup.find_all('div', class_=lambda x: x and 'route' in x)
if route_elements:
    print(f'✅ 找到 {len(route_elements)} 个与路线相关的元素')

# 打印页面标题
print(f'页面标题: {soup.title.string}')
