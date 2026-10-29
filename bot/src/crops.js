/**
 * Требования культур — те же группы и культуры, что на сайте (index.html, CONFIG.crops).
 *   temp    — средняя годовая температура места, °C: [нижний предел, оптимум от, оптимум до, верхний предел]
 *   rain    — осадков в год, мм, при которых культура растёт без полива
 *   slope   — уклон, °: [до какого всё хорошо, с какого пахать нельзя]
 *   sowTemp — порог среднесуточной температуры для начала сева / посадки
 *   perennial — многолетняя (сажают саженцы, а не сеют)
 */
export const CROPS = {
  wheat:     { group: 'grain', name: { ru: 'Яровая пшеница', ky: 'Жаздык буудай' }, temp: [4.5, 7.5, 13, 17], rain: 400, slope: [5, 12], sowTemp: 5 },
  barley:    { group: 'grain', name: { ru: 'Ячмень', ky: 'Арпа' }, temp: [3, 6, 12, 16], rain: 300, slope: [6, 14], sowTemp: 5 },
  corn:      { group: 'grain', name: { ru: 'Кукуруза', ky: 'Жүгөрү' }, temp: [8.5, 10.5, 15, 20], rain: 550, slope: [3, 8], sowTemp: 10 },
  beet:      { group: 'industrial', name: { ru: 'Сахарная свёкла', ky: 'Кант кызылчасы' }, temp: [7.5, 9.5, 14, 18], rain: 600, slope: [3, 7], sowTemp: 6 },
  sunflower: { group: 'industrial', name: { ru: 'Подсолнечник', ky: 'Күн карама' }, temp: [7, 9, 15, 20], rain: 350, slope: [4, 10], sowTemp: 8 },
  cotton:    { group: 'industrial', name: { ru: 'Хлопок', ky: 'Пахта' }, temp: [11, 13, 18, 22], rain: 700, slope: [2, 6], sowTemp: 12 },
  potato:    { group: 'veg', name: { ru: 'Картофель', ky: 'Картошка' }, temp: [2.5, 5, 10, 14], rain: 500, slope: [4, 9], sowTemp: 7 },
  beans:     { group: 'veg', name: { ru: 'Фасоль', ky: 'Төө буурчак' }, temp: [7, 9, 14, 18], rain: 450, slope: [5, 10], sowTemp: 10 },
  raspberry: { group: 'garden', perennial: true, name: { ru: 'Малина', ky: 'Малина' }, temp: [4, 6.5, 11, 15], rain: 600, slope: [6, 15], sowTemp: 5 },
  apple:     { group: 'garden', perennial: true, name: { ru: 'Яблоня', ky: 'Алма' }, temp: [5, 7.5, 13, 17], rain: 550, slope: [8, 18], sowTemp: 5 },
  apricot:   { group: 'garden', perennial: true, name: { ru: 'Абрикос', ky: 'Өрүк' }, temp: [8.5, 10.5, 15, 19], rain: 350, slope: [8, 20], sowTemp: 6 }
};

export const GROUPS = ['grain', 'industrial', 'veg', 'garden'];
export const GROUP_ICON = { grain: '🌾', industrial: '🏭', veg: '🥕', garden: '🍎' };

// Пригодность: ≥ 0,7 — подходит, ≥ 0,35 — с условиями; без полива при нехватке дождей — не выше 0,6
export const SUIT = { good: 0.7, mid: 0.35, irrigatedCap: 0.6 };
