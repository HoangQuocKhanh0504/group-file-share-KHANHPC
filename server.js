const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Lưu file upload vào folder 'uploads/<groupCode>' với tên ngẫu nhiên (để tránh trùng)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const groupCode = req.params.groupCode; // lấy groupCode từ params upload
    const dir = path.join('uploads', groupCode);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Dữ liệu nhóm
// Cấu trúc: { groupCode: { name, maxMembers, members: [{name, id}], files: [{filename, storedName, size, uploader, time}], logs: [] } }
const groups = {};

// Hàm xóa nhóm và thư mục upload
function deleteGroup(groupCode) {
  const group = groups[groupCode];
  if (!group) return;

  // Xóa folder uploads/groupCode
  const dir = path.join(__dirname, 'uploads', groupCode);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deleted uploads folder for group ${groupCode}`);
  }

  // Xóa nhóm khỏi groups
  delete groups[groupCode];
  console.log(`Group ${groupCode} deleted`);
}

// Tạo nhóm
app.post('/create-group', (req, res) => {
  const { groupName, groupCode, maxMembers } = req.body;
  if (!groupName || !groupCode || !maxMembers) {
    return res.status(400).json({ error: 'Thiếu thông tin nhóm' });
  }
  if (groups[groupCode]) {
    return res.status(400).json({ error: 'Mã nhóm đã tồn tại' });
  }
  groups[groupCode] = {
    name: groupName,
    maxMembers: parseInt(maxMembers),
    members: [],
    files: [],
    logs: [],
  };
  res.json({ success: true });
});

// Tham gia nhóm
app.post('/join-group', (req, res) => {
  const { memberName, groupCode } = req.body;
  if (!memberName || !groupCode) {
    return res.status(400).json({ error: 'Thiếu thông tin' });
  }
  const group = groups[groupCode];
  if (!group) {
    return res.status(404).json({ error: 'Nhóm không tồn tại' });
  }
  if (group.members.length >= group.maxMembers) {
    return res.status(400).json({ error: 'Nhóm đã đủ thành viên' });
  }
  if (group.members.find(m => m.name === memberName)) {
    return res.status(400).json({ error: 'Tên thành viên đã tồn tại trong nhóm' });
  }
  res.json({ success: true, groupName: group.name, maxMembers: group.maxMembers });
});

// Upload file lên nhóm (multipart/form-data)
app.post('/upload/:groupCode/:memberName', upload.single('file'), (req, res) => {
  const { groupCode, memberName } = req.params;
  const group = groups[groupCode];
  if (!group) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Nhóm không tồn tại' });
  }
  if (!req.file) return res.status(400).json({ error: 'Không có file upload' });

  const fileData = {
    filename: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    uploader: memberName,
    time: Date.now(),
  };

  group.files.push(fileData);

  // Thêm log
  const logMsg = `${memberName} đã gửi file ${fileData.filename} (${fileData.size} bytes)`;
  group.logs.push({ time: Date.now(), message: logMsg });

  // Phát sự kiện đến nhóm qua Socket.io
  io.to(groupCode).emit('group-log', {
    logs: group.logs,
    files: group.files,
  });

  res.json({ success: true });
});

// Download file theo groupCode và storedName
app.get('/download/:groupCode/:storedName', (req, res) => {
  const { groupCode, storedName } = req.params;
  const group = groups[groupCode];
  if (!group) return res.status(404).send('Nhóm không tồn tại');

  const file = group.files.find(f => f.storedName === storedName);
  if (!file) return res.status(404).send('File không tồn tại trong nhóm');

  const filePath = path.join(__dirname, 'uploads', groupCode, storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File không tồn tại trên server');

  res.download(filePath, file.filename);
});

// Socket.io xử lý join/leave nhóm và nhật ký
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-group', ({ memberName, groupCode }) => {
    const group = groups[groupCode];
    if (!group) {
      socket.emit('join-error', 'Nhóm không tồn tại');
      return;
    }
    if (group.members.length >= group.maxMembers) {
      socket.emit('join-error', 'Nhóm đã đầy');
      return;
    }
    if (group.members.find(m => m.name === memberName)) {
      socket.emit('join-error', 'Tên thành viên đã tồn tại');
      return;
    }

    // Thêm member
    group.members.push({ name: memberName, id: socket.id });
    socket.join(groupCode);

    // Log sự kiện
    const msg = `${memberName} đã vào nhóm`;
    group.logs.push({ time: Date.now(), message: msg });
    io.to(groupCode).emit('group-log', {
      logs: group.logs,
      files: group.files,
      members: group.members.map(m => m.name),
    });
  });

  socket.on('leave-group', ({ memberName, groupCode }) => {
    const group = groups[groupCode];
    if (!group) return;

    group.members = group.members.filter(m => m.name !== memberName);
    socket.leave(groupCode);

    const msg = `${memberName} đã rời nhóm`;
    group.logs.push({ time: Date.now(), message: msg });
    io.to(groupCode).emit('group-log', {
      logs: group.logs,
      files: group.files,
      members: group.members.map(m => m.name),
    });

    // Nếu nhóm trống thì xóa nhóm
    if (group.members.length === 0) {
      deleteGroup(groupCode);
    }
  });

  socket.on('disconnect', () => {
    for (const [groupCode, group] of Object.entries(groups)) {
      const member = group.members.find(m => m.id === socket.id);
      if (member) {
        group.members = group.members.filter(m => m.id !== socket.id);
        const msg = `${member.name} đã rời nhóm (mất kết nối)`;
        group.logs.push({ time: Date.now(), message: msg });
        io.to(groupCode).emit('group-log', {
          logs: group.logs,
          files: group.files,
          members: group.members.map(m => m.name),
        });

        // Nếu nhóm trống thì xóa nhóm
        if (group.members.length === 0) {
          deleteGroup(groupCode);
        }
      }
    }
  });
});

io.on('connection', socket => {
  let writeStream = null;
  let currentFileName = '';

  socket.on('upload-chunk', ({ data, fileName, totalSize, offset }) => {
    if (!writeStream) {
      currentFileName = fileName;
      writeStream = fs.createWriteStream(path.join(__dirname, 'uploads', currentFileName));
    }
    const buffer = Buffer.from(new Uint8Array(data));
    writeStream.write(buffer);

    if (offset + buffer.length >= totalSize) {
      writeStream.end();
      writeStream = null;
      socket.emit('upload-complete', currentFileName);
    }
  });
});

const uploadDir = './uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('Created uploads directory');
}

server.listen(PORT, () => {
  console.log(`Server đang chạy trên http://localhost:${PORT}`);
});
