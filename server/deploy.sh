#!/bin/bash
# ============================================
# 仓库管理助手 - 云端服务一键部署脚本
# 使用方式: bash deploy.sh
# 前提: 服务器已安装 Docker 和 Docker Compose
# ============================================
set -e

echo "🚀 仓库管理助手 - 云端服务部署"
echo "================================"
echo ""

# 1. 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ 未安装 Docker，请先安装："
    echo "   curl -fsSL https://get.docker.com | bash"
    exit 1
fi

# 2. 生成 .env（如果不存在）
if [ ! -f .env ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > .env << ENVEOF
DB_NAME=warehouse
DB_USER=warehouse
DB_PASSWORD=$(openssl rand -hex 8)
JWT_SECRET=${JWT_SECRET}
ADMIN_SECRET=$(openssl rand -hex 24)
PORT=3001
ENVEOF
    echo "✅ 已生成 .env 配置文件"
else
    echo "✅ .env 已存在，跳过生成"
fi

if ! grep -q '^JWT_SECRET=' .env; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
    echo "✅ 已补充 JWT_SECRET"
fi

if ! grep -q '^ADMIN_SECRET=' .env; then
    echo "ADMIN_SECRET=$(openssl rand -hex 24)" >> .env
    echo "✅ 已补充 ADMIN_SECRET"
fi

# 3. 拉取/构建镜像
echo ""
echo "📦 构建服务镜像..."
mkdir -p uploads/app
docker compose build

# 4. 启动服务
echo ""
echo "▶️  启动服务..."
docker compose up -d

# 5. 等待数据库就绪
echo ""
echo "⏳ 等待数据库就绪..."
sleep 5

# 6. 初始化数据库表
echo ""
echo "🗄️  初始化数据库表..."
docker compose exec -T api node dist/db-init.js 2>/dev/null || \
  echo "⚠️  db-init 未找到，表可能已在首次启动时自动创建"

# 7. 检查状态
echo ""
echo "📊 服务状态："
docker compose ps

echo ""
echo "================================"
echo "🎉 部署完成！"
echo ""
echo "API 地址:  http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):3001"
echo "健康检查:  http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):3001/api/health"
echo "安装包目录:  http://$(curl -s ifconfig.me 2>/dev/null || echo '你的服务器IP'):3001/downloads/app/"
echo ""
echo "客户端设置 → 云服务器地址 填入上面的 API 地址即可"
echo ""
echo "管理命令："
echo "  docker compose logs -f    查看日志"
echo "  docker compose restart    重启服务"
echo "  docker compose down       停止服务"
echo "  docker compose up -d      启动服务"
