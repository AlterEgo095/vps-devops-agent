import axios from 'axios';
import { JSDOM } from 'jsdom';

/**
 * Search web with DuckDuckGo
 */
export async function searchWeb(query, options = {}) {
  const {
    maxResults = 10,
    region = 'fr-fr',
    safeSearch = 'moderate'
  } = options;

  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      },
      timeout: 10000
    });

    const data = response.data;
    const results = [];

    if (data.Abstract) {
      results.push({
        type: 'instant',
        title: data.Heading,
        snippet: data.Abstract,
        url: data.AbstractURL,
        source: data.AbstractSource
      });
    }

    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      data.RelatedTopics.slice(0, maxResults).forEach(topic => {
        if (topic.Text) {
          results.push({
            type: 'related',
            title: topic.Text.substring(0, 100),
            snippet: topic.Text,
            url: topic.FirstURL,
            icon: topic.Icon?.URL
          });
        }
      });
    }

    return {
      success: true,
      query,
      results,
      count: results.length,
      metadata: {
        engine: 'DuckDuckGo',
        region,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Web search error:', error);
    return {
      success: false,
      error: error.message,
      query
    };
  }
}

/**
 * Advanced web search with HTML scraping
 */
export async function searchWebAdvanced(query, maxResults = 10) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    const results = [];

    const resultElements = document.querySelectorAll('.result');
    
    resultElements.forEach((element, index) => {
      if (index >= maxResults) return;

      const titleEl = element.querySelector('.result__title');
      const snippetEl = element.querySelector('.result__snippet');
      const urlEl = element.querySelector('.result__url');

      if (titleEl && snippetEl) {
        results.push({
          type: 'web',
          title: titleEl.textContent.trim(),
          snippet: snippetEl.textContent.trim(),
          url: urlEl?.textContent.trim() || '#',
          position: index + 1
        });
      }
    });

    return {
      success: true,
      query,
      results,
      count: results.length,
      metadata: {
        engine: 'DuckDuckGo HTML',
        method: 'scraping',
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Advanced search error:', error);
    return {
      success: false,
      error: error.message,
      query
    };
  }
}

/**
 * Fetch web page content
 */
export async function fetchWebPage(url, options = {}) {
  const {
    timeout = 10000,
    extractText = true,
    extractLinks = false
  } = options;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DevOpsAgent/1.0)'
      },
      timeout
    });

    const result = {
      success: true,
      url,
      statusCode: response.status,
      contentType: response.headers['content-type'],
      size: response.data.length
    };

    if (extractText && response.headers['content-type'].includes('text/html')) {
      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      result.title = document.querySelector('title')?.textContent || 'No title';
      result.text = document.body.textContent.trim().substring(0, 5000);

      if (extractLinks) {
        result.links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent.trim(),
          href: a.href
        })).slice(0, 50);
      }
    } else {
      result.content = response.data;
    }

    return result;

  } catch (error) {
    console.error('Fetch page error:', error);
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

/**
 * Search news
 */
export async function searchNews(query, language = 'fr') {
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: `${query} news`,
        format: 'json',
        no_html: 1
      },
      timeout: 10000
    });

    const data = response.data;
    const news = [];

    if (data.RelatedTopics) {
      data.RelatedTopics.forEach(topic => {
        if (topic.Text && topic.FirstURL) {
          news.push({
            title: topic.Text.substring(0, 150),
            url: topic.FirstURL,
            source: new URL(topic.FirstURL).hostname
          });
        }
      });
    }

    return {
      success: true,
      query,
      news,
      count: news.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check URL accessibility
 */
export async function checkUrl(url, timeout = 5000) {
  try {
    const response = await axios.head(url, { timeout });
    return {
      success: true,
      accessible: true,
      statusCode: response.status,
      headers: response.headers
    };
  } catch (error) {
    return {
      success: true,
      accessible: false,
      error: error.message
    };
  }
}

export default {
  searchWeb,
  searchWebAdvanced,
  fetchWebPage,
  searchNews,
  checkUrl
};
