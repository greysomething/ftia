import { mysql } from './db'
import * as fs from 'fs'

const slugs = ['what-is-production-list', 'membership-plans', 'membership-levels']

for (const slug of slugs) {
  const pages = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content,
           pm.meta_value AS elementor_data
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_elementor_data'
    WHERE p.post_name = '${slug}' AND p.post_type = 'page' AND p.post_status = 'publish'
    LIMIT 1
  `)

  if (pages.length > 0) {
    const page = pages[0]
    console.log(`\n=== ${page.post_title} (${slug}) ===`)
    console.log(`  Content length: ${page.post_content?.length ?? 0}`)
    console.log(`  Elementor data length: ${page.elementor_data?.length ?? 0}`)

    if (page.elementor_data) {
      // Save elementor data to file for analysis
      fs.writeFileSync(`/tmp/elementor-${slug}.json`, page.elementor_data)
      console.log(`  Saved to /tmp/elementor-${slug}.json`)

      // Parse and summarize structure
      try {
        const data = JSON.parse(page.elementor_data)
        function summarize(elements: any[], depth: number = 0): void {
          for (const el of elements) {
            const indent = '  '.repeat(depth + 1)
            let label = el.elType
            if (el.widgetType) label += ` (${el.widgetType})`
            const s = el.settings || {}

            // Key content
            let content = ''
            if (el.widgetType === 'heading' && s.title) content = s.title.substring(0, 80)
            if (el.widgetType === 'text-editor' && s.editor) content = s.editor.replace(/<[^>]+>/g, '').substring(0, 80)
            if (el.widgetType === 'button' && s.text) content = `"${s.text}" -> ${s.link?.url || ''}`
            if (el.widgetType === 'video' && s.youtube_url) content = s.youtube_url
            if (el.widgetType === 'video' && s.vimeo_url) content = s.vimeo_url
            if (el.widgetType === 'image' && s.image?.url) content = s.image.url.split('/').pop()
            if (el.widgetType === 'icon-list') content = `${(s.icon_list || []).length} items`
            if (el.widgetType === 'testimonial-carousel') content = `${(s.slides || []).length} slides`
            if (el.widgetType === 'price-table') content = `${s.heading} - $${s.price}`
            if (el.widgetType === 'price-list') content = `${(s.price_list || []).length} items`

            // Background
            let bg = ''
            if (s.background_background === 'classic' && s.background_image?.url) {
              bg = ` [bg: ${s.background_image.url.split('/').pop()}]`
            }
            if (s.background_background === 'classic' && s.background_color) {
              bg = ` [bg: ${s.background_color}]`
            }
            if (s.background_background === 'slideshow') bg = ' [bg: slideshow]'

            console.log(`${indent}${label}${bg}${content ? ': ' + content : ''}`)

            if (el.elements?.length) {
              summarize(el.elements, depth + 1)
            }
          }
        }
        if (Array.isArray(data)) {
          summarize(data)
        }
      } catch (e: any) {
        console.log(`  Parse error: ${e.message}`)
      }
    }
  }
}
