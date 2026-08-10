import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# 配置Chrome选项
options = webdriver.ChromeOptions()
options.add_argument('--headless')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')

try:
    # 启动Chrome浏览器
    with webdriver.Chrome(options=options) as driver:
        # 访问地图页面
        driver.get('http://localhost:5178')

        # 等待页面加载
        time.sleep(5)

        # 检查页面标题
        print(f'页面标题: {driver.title}')

        # 检查是否有地图容器
        map_container = driver.find_element(By.CLASS_NAME, 'map-shell')
        if map_container:
            print('地图容器已找到')

        # 检查是否有地图控件
        nav_control = driver.find_element(By.CLASS_NAME, 'maplibregl-ctrl')
        if nav_control:
            print('地图控件已找到')

        # 检查控制台是否有错误
        logs = driver.get_log('browser')
        for log in logs:
            if log['level'] == 'SEVERE':
                print(f'控制台错误: {log["message"]}')

        # 等待地图加载完成
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, 'maplibregl-map'))
            )
            print('地图已加载完成')

            # 检查地图是否已加载瓦片
            tile_elements = driver.find_elements(By.CSS_SELECTOR, 'img.maplibregl-tile')
            if tile_elements:
                print(f'已加载 {len(tile_elements)} 个地图瓦片')

        except TimeoutException:
            print('地图加载超时')

        # 截图
        driver.save_screenshot('/tmp/map-screenshot.png')
        print('地图截图已保存到 /tmp/map-screenshot.png')

except Exception as e:
    print(f'访问地图页面失败: {e}')
