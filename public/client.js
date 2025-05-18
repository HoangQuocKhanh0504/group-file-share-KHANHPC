const socket = io();
const createGroupDiv = document.getElementById('create-group-div');
const joinGroupDiv = document.getElementById('join-group-div');
const groupArea = document.getElementById('group-area');

const groupNameInput = document.getElementById('group-name');
const groupCodeInput = document.getElementById('group-code');
const maxMembersInput = document.getElementById('max-members');
const createGroupBtn = document.getElementById('create-group-btn');
const createGroupMsg = document.getElementById('create-group-msg');

const memberNameInput = document.getElementById('member-name');
const joinGroupCodeInput = document.getElementById('join-group-code');
const joinGroupBtn = document.getElementById('join-group-btn');
const joinGroupMsg = document.getElementById('join-group-msg');

const displayGroupName = document.getElementById('display-group-name');
const memberCountSpan = document.getElementById('member-count');
const membersList = document.getElementById('members-list');

const fileInput = document.getElementById('file-input');
const uploadFileBtn = document.getElementById('upload-file-btn');
const uploadMsg = document.getElementById('upload-msg');

const logList = document.getElementById('log-list');
const filesList = document.getElementById('files-list');

const leaveGroupBtn = document.getElementById('leave-group-btn');

let currentGroupCode = null;
let currentGroupName = null;
let currentMemberName = null;

// Tạo nhóm
createGroupBtn.onclick = async () => {
  createGroupMsg.textContent = '';
  const groupName = groupNameInput.value.trim();
  const groupCode = groupCodeInput.value.trim();
  const maxMembers = maxMembersInput.value.trim();

  if (!groupName || !groupCode || !maxMembers) {
    createGroupMsg.textContent = 'Vui lòng điền đầy đủ thông tin';
    return;
  }

  try {
    const res = await fetch('/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName, groupCode, maxMembers }),
    });
    const data = await res.json();
    if (data.error) {
      createGroupMsg.textContent = data.error;
    } else {
      alert('Tạo nhóm thành công! Bây giờ bạn có thể tham gia nhóm.');
      groupNameInput.value = '';
      groupCodeInput.value = '';
      maxMembersInput.value = '';
    }
  } catch (err) {
    createGroupMsg.textContent = 'Lỗi kết nối server';
  }
};

// Tham gia nhóm
joinGroupBtn.onclick = async () => {
  joinGroupMsg.textContent = '';
  const memberName = memberNameInput.value.trim();
  const groupCode = joinGroupCodeInput.value.trim();

  if (!memberName || !groupCode) {
    joinGroupMsg.textContent = 'Vui lòng điền đầy đủ thông tin';
    return;
  }

  try {
    const res = await fetch('/join-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberName, groupCode }),
    });
    const data = await res.json();
    if (data.error) {
      joinGroupMsg.textContent = data.error;
      return;
    }
    currentGroupCode = groupCode;
    currentGroupName = data.groupName;
    currentMemberName = memberName;

    displayGroupName.textContent = currentGroupName;
    joinGroupDiv.classList.add('hidden');
    createGroupDiv.classList.add('hidden');
    groupArea.classList.remove('hidden');

    // Gửi join-group qua socket để server quản lý
    socket.emit('join-group', { memberName, groupCode });
  } catch (err) {
    joinGroupMsg.textContent = 'Lỗi kết nối server';
  }
};

// Nhận nhật ký và danh sách file
socket.on('group-log', ({ logs, files, members }) => {
  if (!logs || !files) return;

  // Hiển thị logs
  logList.innerHTML = '';
  logs.forEach(log => {
    const li = document.createElement('li');
    li.textContent = `[${new Date(log.time).toLocaleTimeString()}] ${log.message}`;
    logList.appendChild(li);
  });

  // Hiển thị file
  filesList.innerHTML = '';
  files.forEach(file => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/download/${currentGroupCode}/${file.storedName}`;
    a.textContent = `${file.filename} (${file.size} bytes) - tải về`;
    a.target = '_blank';
    li.textContent = `${file.uploader} đã gửi file `;
    li.appendChild(a);
    li.appendChild(document.createTextNode(` lúc ${new Date(file.time).toLocaleString()}`));
    filesList.appendChild(li);
  });

  // Hiển thị thành viên
  if (members) {
    membersList.innerHTML = '';
    members.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      membersList.appendChild(li);
    });
    memberCountSpan.textContent = members.length;
  }
});

// Xử lý lỗi join nhóm
socket.on('join-error', (msg) => {
  joinGroupMsg.textContent = msg;
});

// Upload file
function showLoading() {
  uploadFileBtn.disabled = true;
  uploadFileBtn.textContent = 'Đang gửi... ⏳';
  uploadProgress.textContent = '';
  uploadMsg.textContent = '';
}

function hideLoading() {
  uploadFileBtn.disabled = false;
  uploadFileBtn.textContent = 'Gửi file';
}

// Hàm upload file chunk (theo chunk lớn 512KB và gửi song song 3 chunk)
// Bạn có thể thay thế hoặc sửa lại nếu đã có sẵn hàm upload của bạn
function uploadFile(file) {
  const chunkSize = 512 * 1024; // 512KB
  const totalChunks = Math.ceil(file.size / chunkSize);
  let chunkIndex = 0;
  const concurrency = 3;
  let activeUploads = 0;

  showLoading();

  function sendChunk(index) {
    if (index >= totalChunks) return;
    activeUploads++;

    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const reader = new FileReader();
    reader.onload = e => {
      const arrayBuffer = e.target.result;
      socket.emit('upload-chunk', {
        data: arrayBuffer,
        fileName: file.name,
        totalSize: file.size,
        chunkIndex: index,
        totalChunks,
      });

      activeUploads--;
      uploadProgress.textContent = `Đã gửi chunk ${index + 1} / ${totalChunks}`;

      // Nếu còn chunk chưa gửi thì gửi tiếp
      if (chunkIndex < totalChunks) {
        sendChunk(chunkIndex++);
      }

      // Nếu tất cả chunk đã gửi và không còn active uploads
      if (chunkIndex >= totalChunks && activeUploads === 0) {
        uploadProgress.textContent = 'Đang hoàn tất upload...';
      }
    };
    reader.readAsArrayBuffer(chunk);
  }

  // Bắt đầu gửi concurrency chunk đầu tiên
  for (; chunkIndex < concurrency && chunkIndex < totalChunks; chunkIndex++) {
    sendChunk(chunkIndex);
  }
}

// Xử lý nút bấm gửi file
uploadFileBtn.addEventListener('click', () => {
  if (!fileInput.files.length) {
    uploadMsg.textContent = 'Vui lòng chọn file trước khi gửi.';
    return;
  }
  uploadMsg.textContent = '';
  uploadProgress.textContent = '';
  uploadFile(fileInput.files[0]);
});

// Lắng nghe sự kiện upload-complete từ server để ẩn loading
socket.on('upload-complete', (fileName) => {
  uploadProgress.textContent = `Upload file "${fileName}" thành công! 🎉`;
  hideLoading();
});

// Lắng nghe sự kiện lỗi upload
socket.on('upload-error', (msg) => {
  uploadMsg.textContent = `Lỗi khi upload: ${msg}`;
  hideLoading();
});
