from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# 配置Chrome选项，启用GPU加速
options = webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--disable-gpu')  # 禁用GPU加速（在某些环境下启用可能会有问题）
options.add_argument('--window-size=1920,1080')
# 启用WebGL
options.add_argument('--enable-webgl')
options.add_argument('--ignore-gpu-blocklist')

try:
    # 启动Chrome浏览器
    print("启动Chrome浏览器...")
    driver = webdriver.Chrome(options=options)

    # 访问地图页面
    print(f"访问地图页面: http://localhost:5179")
    driver.get("http://localhost:5179")

    # 等待页面加载
    time.sleep(3)

    # 检查页面基本信息
    print(f"页面标题: {driver.title}")
    print(f"当前URL: {driver.current_url}")

    # 等待地图容器加载
    print("等待地图容器加载...")
    try:
        map_shell = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "map-shell"))
        )
        print("✅ 地图容器已找到")
    except Exception as e:
        print(f"❌ 地图容器未找到: {e}")

    # 检查浏览器控制台日志
    print("\n浏览器控制台日志:")
    logs = driver.get_log('browser')
    for log in logs:
        if log['level'] == 'SEVERE':
            print(f"❌ 错误: {log['message']}")
        elif log['level'] == 'WARNING':
            print(f"⚠️  警告: {log['message']}")
        else:
            print(f"ℹ️  信息: {log['message']}")

    # 截图
    screenshot_path = '/tmp/map-gpu-screenshot.png'
    driver.save_screenshot(screenshot_path)
    print(f"\n✅ 地图截图已保存: {screenshot_path}")

    # 检查页面源代码
    print("\n页面源代码前500字符:")
    print(driver.page_source[:500])

except Exception as e:
    print(f"❌ 测试失败: {e}")
    import traceback
    print(f"\n详细错误信息:\n{traceback.format_exc()}")

finally:
    try:
        driver.quit()
        print("\n✅ 浏览器已关闭")
    except:
        pass
