from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# 配置Chrome选项
options = webdriver.ChromeOptions()
options.add_argument('--headless')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--disable-gpu')
options.add_argument('--window-size=1920,1080')

try:
    # 启动Chrome浏览器
    print("启动Chrome浏览器...")
    driver = webdriver.Chrome(options=options)

    # 访问地图页面
    print(f"访问地图页面: http://localhost:5179")
    driver.get("http://localhost:5179")

    # 等待页面加载
    time.sleep(2)

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

        # 等待地图画布加载
        try:
            map_canvas = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "map-canvas"))
            )
            print("✅ 地图画布已找到")
            print(f"地图画布尺寸: {map_canvas.size}")
        except Exception as e:
            print(f"❌ 地图画布未找到: {e}")

        # 等待地图控件加载
        try:
            map_controls = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".maplibregl-ctrl"))
            )
            print("✅ 地图控件已找到")
        except Exception as e:
            print(f"❌ 地图控件未找到: {e}")

        # 等待地图瓦片加载
        try:
            map_tiles = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "img.maplibregl-tile"))
            )
            print("✅ 地图瓦片已加载")
            # 统计瓦片数量
            all_tiles = driver.find_elements(By.CSS_SELECTOR, "img.maplibregl-tile")
            print(f"地图瓦片数量: {len(all_tiles)}")
        except Exception as e:
            print(f"❌ 地图瓦片未加载: {e}")

    except Exception as e:
        print(f"❌ 地图未加载: {e}")

    # 检查控制台日志
    print("\n检查控制台日志...")
    logs = driver.get_log('browser')
    if logs:
        error_count = 0
        warning_count = 0
        info_count = 0

        for log in logs:
            if log['level'] == 'SEVERE':
                error_count += 1
                print(f"❌ 错误: {log['message']}")
            elif log['level'] == 'WARNING':
                warning_count += 1
                print(f"⚠️  警告: {log['message']}")
            else:
                info_count += 1

        print(f"\n日志统计: 错误 {error_count} 个, 警告 {warning_count} 个, 信息 {info_count} 个")
    else:
        print("控制台无日志信息")

    # 截图
    screenshot_path = '/tmp/map-dynamic-screenshot.png'
    driver.save_screenshot(screenshot_path)
    print(f"\n✅ 地图截图已保存: {screenshot_path}")

    # 检查地图显示区域
    try:
        map_wrapper = driver.find_element(By.CLASS_NAME, "map-shell")
        map_rect = map_wrapper.rect
        print(f"\n地图容器尺寸:")
        print(f"  宽度: {map_rect['width']}px")
        print(f"  高度: {map_rect['height']}px")
        print(f"  坐标: ({map_rect['x']}, {map_rect['y']})")
    except Exception as e:
        print(f"获取地图尺寸失败: {e}")

    # 尝试模拟用户交互
    try:
        print("\n尝试模拟地图交互...")
        # 尝试点击地图
        driver.find_element(By.CLASS_NAME, "map-canvas").click()
        time.sleep(0.5)
        print("✅ 地图交互成功")
    except Exception as e:
        print(f"地图交互失败: {e}")

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
