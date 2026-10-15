import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { jest } from '@jest/globals';
import http from 'http';

// Mock Ollama
jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue({
      message: {
        content: JSON.stringify({
          'Dial_Color': 'blue',
          'Type': 'chronograph',
          'Price_Max': 10000
        })
      }
    }),
    embeddings: jest.fn().mockResolvedValue({
      embedding: new Array(768).fill(0.1)
    }),
  }))
}));

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  })
}));

// Mock environment variables
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-key';

// Import your server
import app from './server.js';

describe('Backend API Tests', () => {
  describe('POST /api/analyze-query', () => {
    it('should analyze a valid query', async () => {
      const response = await request(app)
        .post('/api/analyze-query')
        .send({ query: 'Find me a blue chronograph under 10000' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle missing query parameter', async () => {
      const response = await request(app)
        .post('/api/analyze-query')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid query parameter');
    });
  });

  describe('POST /api/hybrid-search', () => {
    it('should perform hybrid search', async () => {
      const response = await request(app)
        .post('/api/hybrid-search')
        .send({ query: 'blue diving watch under 5000' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle missing query parameter', async () => {
      const response = await request(app)
        .post('/api/hybrid-search')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/proxy-image', () => {
    it('should handle missing URL parameter', async () => {
      const response = await request(app)
        .get('/api/proxy-image')
        .expect(400);

      expect(response.body.error).toBe('Image URL is required');
    });

    it('should reject invalid image sources', async () => {
      const response = await request(app)
        .get('/api/proxy-image?url=https://invalid-domain.com/image.jpg')
        .expect(400);

      expect(response.body.error).toBe('Invalid image source');
    });

    it('should handle valid image URLs', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'image/jpeg' },
        pipe: jest.fn()
      };

      http.get = jest.fn().mockImplementation((url, callback) => {
        callback(mockResponse);
        return {
          on: jest.fn(),
          destroy: jest.fn()
        };
      });

      const response = await request(app)
        .get('/api/proxy-image?url=https://api-watches-v2.makingdatameaningful.com/files/watches/123/image.jpg')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('public, max-age=86400');
    }, 30000);
  });

  describe('Rate Limiting', () => {
    it('should limit requests within the time window', async () => {
      const requests = Array(101).fill().map(() =>
        request(app)
          .post('/api/analyze-query')
          .send({ query: 'test query' })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
});
