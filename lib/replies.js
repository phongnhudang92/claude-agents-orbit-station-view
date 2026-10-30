"use strict";
// Lịch sử reply (các khối chữ của trợ lý) của một phiên, để giao diện bấm "tải thêm" xem lại các reply trước.
// Mọi hàm trả về giá trị mới; seq tăng dần theo từng reply nên làm mốc phân trang.
const CAP = 60;        // số reply nhớ cho mỗi phiên
const FULL = 8000;     // độ dài tối đa lưu cho mỗi reply
const PREVIEW = 1500;  // độ dài trả về trong danh sách; bản đầy đủ lấy qua hộp đọc

const emptyReplies = () => ({ list: [], seq: 0 });

function pushReply(state, text, t) {
  const last = state.list[state.list.length - 1];
  if (!text || (last && last.text === text)) return state;
  const seq = state.seq + 1;
  return { seq, list: [...state.list, { seq, t, text: text.slice(0, FULL) }].slice(-CAP) };
}

// Các reply có seq nhỏ hơn `before`, mới nhất trước. `more` cho biết còn reply cũ hơn nữa.
function pageReplies(state, before, limit) {
  const older = state.list.filter((r) => r.seq < before);
  const items = older.slice(-limit).reverse().map((r) => ({ seq: r.seq, t: r.t, text: r.text.slice(0, PREVIEW), long: r.text.length > PREVIEW }));
  return { items, more: older.length > limit };
}

const findReply = (state, seq) => state.list.find((r) => r.seq === seq) || null;

module.exports = { emptyReplies, pushReply, pageReplies, findReply, CAP };
