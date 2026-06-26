import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { extractOrderFromImageWithKey } from '../ocr-service'

const router = Router()

router.use(authMiddleware)

function getServerOcrApiKey(): string {
  return (
    process.env.OCR_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim()
}

router.post('/extract', async (req: Request, res: Response) => {
  try {
    const base64Image = String(req.body?.base64Image || '')

    if (!base64Image) {
      res.status(400).json({ error: '请上传待识别图片' })
      return
    }

    const apiKey = getServerOcrApiKey()
    if (!apiKey) {
      res.status(400).json({ error: '服务器未配置 OCR API Key，请联系管理员' })
      return
    }

    const result = await extractOrderFromImageWithKey(apiKey, base64Image)
    res.json(result)
  } catch (err: any) {
    console.error('[ocr] extract error:', err.message)
    res.status(500).json({ error: err.message || 'OCR 识别失败' })
  }
})

export default router
