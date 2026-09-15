const { fetchAccuracyProducts } = require('../src/actions/dashboardAccuracyAction');
const accuracyModel = require('../src/models/dashboardAccuracyModel');

// 1. Memalsukan (Mock) koneksi Database agar test berjalan sangat cepat tanpa beban
jest.mock('../src/models/dashboardAccuracyModel');

describe('Pengujian Dashboard Accuracy Action', () => {
  
  it('Harus berhasil merespons dengan data akurasi (Status 200)', async () => {
    // Skenario 1: Database berhasil mengirim data
    const mockData = [{ name: 'VCT', value: 95.5 }];
    accuracyModel.getAccuracyProductsByDate.mockResolvedValue(mockData);

    const req = { query: { date: '2026-09-14' } };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await fetchAccuracyProducts(req, res);

    expect(accuracyModel.getAccuracyProductsByDate).toHaveBeenCalledWith('2026-09-14');
    expect(res.json).toHaveBeenCalledWith(mockData);
  });

  it('Harus merespons dengan Status 500 saat terjadi error database', async () => {
    // Skenario 2: Database simulasi error
    accuracyModel.getAccuracyProductsByDate.mockRejectedValue(new Error('Koneksi Terputus'));

    const req = { query: { date: '2026-09-14' } };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Meredam console.error sementara agar terminal test tetap bersih
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await fetchAccuracyProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Gagal mengambil data akurasi' });

    consoleSpy.mockRestore();
  });
});