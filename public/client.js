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
uploadFileBtn.onclick = async () => {
  uploadMsg.textContent = '';
  if (!fileInput.files.length) {
    uploadMsg.textContent = 'Vui lòng chọn file để gửi';
    return;
  }
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/upload/${currentGroupCode}/${currentMemberName}`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.error) {
      uploadMsg.textContent = data.error;
    } else {
      uploadMsg.style.color = 'green';
      uploadMsg.textContent = 'Gửi file thành công';
      fileInput.value = '';
    }
  } catch (err) {
    uploadMsg.textContent = 'Lỗi gửi file';
  }
};

// Rời nhóm
leaveGroupBtn.onclick = () => {
  if (!currentGroupCode || !currentMemberName) return;

  socket.emit('leave-group', { memberName: currentMemberName, groupCode: currentGroupCode });

  // Reset UI
  currentGroupCode = null;
  currentGroupName = null;
  currentMemberName = null;

  groupArea.classList.add('hidden');
  joinGroupDiv.classList.remove('hidden');
  createGroupDiv.classList.remove('hidden');

  logList.innerHTML = '';
  filesList.innerHTML = '';
  membersList.innerHTML = '';
  memberCountSpan.textContent = '0';

  memberNameInput.value = '';
  joinGroupCodeInput.value = '';
  uploadMsg.textContent = '';
};


uploadBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) {
    uploadMsg.textContent = 'Vui lòng chọn file trước khi gửi.';
    uploadProgress.textContent = '';
    return;
  }
  uploadMsg.textContent = '';
  uploadProgress.textContent = 'Đang chuẩn bị gửi...';

  const chunkSize = 1000 * 1024; // 64KB mỗi lần gửi
  const totalSize = file.size;
  let offset = 0;

  const reader = new FileReader();

  reader.onload = e => {
    // Gửi chunk qua socket
    socket.emit('upload-chunk', { 
      data: e.target.result, 
      fileName: file.name,
      totalSize: totalSize,
      offset: offset
    });

    offset += e.target.result.byteLength;

    // Cập nhật tiến trình gửi file
    uploadProgress.textContent = `Đang gửi file: ${offset.toLocaleString()}/${totalSize.toLocaleString()} byte`;

    if (offset < totalSize) {
      readSlice(offset);
    } else {
      uploadProgress.textContent = `Gửi file hoàn tất: ${totalSize.toLocaleString()} byte`;
    }
  };

  reader.onerror = () => {
    uploadMsg.textContent = 'Lỗi khi đọc file.';
    uploadProgress.textContent = '';
  };

  function readSlice(o) {
    const slice = file.slice(o, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  readSlice(0);
});
