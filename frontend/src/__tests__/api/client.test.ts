import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WTPClient } from '../../api/client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WTPClient', () => {
  let client: WTPClient;

  beforeEach(() => {
    client = new WTPClient('http://localhost:8006');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPeople', () => {
    it('fetches people with default params', async () => {
      const mockData = {
        total: 1,
        people: [{ person_id: 'test', display_name: 'Test', party: 'D' }],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await client.getPeople();
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.total).toBe(1);
      expect(result.people).toHaveLength(1);
    });

    it('passes query params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, people: [] }),
      });

      await client.getPeople({ q: 'test', limit: 10, offset: 5 });
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=test');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getPeople()).rejects.toThrow('HTTP 500');
    });
  });

  describe('getDashboardStats', () => {
    it('fetches dashboard stats', async () => {
      const mockStats = {
        total_members: 100,
        total_actions: 5000,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const result = await client.getDashboardStats();
      expect(result).toEqual(mockStats);
    });
  });

  describe('getBill', () => {
    it('encodes bill ID in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          bill_id: 'hr1234-119',
          title: 'Test Bill',
          bill_type: 'hr',
          congress: 119,
          bill_number: 1234,
          actions: [],
        }),
      });

      await client.getBill('hr1234-119');
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/bills/hr1234-119');
    });
  });

  describe('getVotes', () => {
    it('passes pagination params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 0, votes: [] }),
      });

      await client.getVotes({ congress: 119, chamber: 'house', limit: 25 });
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('congress=119');
      expect(calledUrl).toContain('chamber=house');
      expect(calledUrl).toContain('limit=25');
    });
  });

  describe('getPersonProfile', () => {
    it('constructs URL with encoded person ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ person_id: 'nancy-pelosi', name: 'Nancy Pelosi' }),
      });

      await client.getPersonProfile('nancy-pelosi');
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:8006/people/nancy-pelosi/profile');
    });
  });

  describe('constructor', () => {
    it('strips trailing slash from base URL', () => {
      const c = new WTPClient('http://example.com/');
      // The internal baseUrl should not end with /
      // We verify by calling a method and checking the URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      c.getDashboardStats();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://example.com/dashboard/stats');
    });
  });
});
