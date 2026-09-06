import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import os from "os";
import path from "path";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1, // 1MB - dùng cho avatar
  },
});

// dùng riêng cho ảnh gửi trong tin nhắn chat, giới hạn lớn hơn avatar
export const uploadMessageImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB
  },
});

// 👇 MỚI THÊM: video phải lưu tạm ra ổ đĩa (KHÔNG memoryStorage như ảnh) vì
// video có thể rất lớn -> giữ trong RAM (buffer) sẽ dễ làm server tràn bộ
// nhớ khi nhiều người upload cùng lúc. Cloudinary upload_large cần đọc file
// theo từng chunk từ đường dẫn thật trên đĩa, không nhận buffer trực tiếp.
const videoTempDir = path.join(os.tmpdir(), "viechat-video-uploads");
if (!fs.existsSync(videoTempDir)) {
  fs.mkdirSync(videoTempDir, { recursive: true });
}

export const uploadMessageVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoTempDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(
        file.originalname
      )}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 1024 * 1024 * 300, // 300MB - chỉnh theo gói Cloudinary bạn đang dùng
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Định dạng video không được hỗ trợ"));
    }
    cb(null, true);
  },
});

export const uploadImageFromBuffer = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "viechat/avatars",
        resource_type: "image",
        transformation: [{ width: 200, height: 200, crop: "fill" }],
        ...options,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
};

// 👇 MỚI THÊM: upload video từ file tạm trên ổ đĩa lên Cloudinary bằng
// upload_large - đọc và đẩy lên theo từng chunk (6MB/chunk), tránh timeout
// và tràn RAM khi video dài/nặng. Luôn xoá file tạm sau khi xong (thành
// công hay lỗi đều xoá) để không rác ổ đĩa server.
export const uploadVideoFromPath = (filePath, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        folder: "viechat/messages/videos",
        resource_type: "video",
        chunk_size: 6 * 1024 * 1024, // 6MB mỗi chunk
        eager: [{ width: 400, height: 400, crop: "pad", format: "jpg" }], // thumbnail từ frame đầu
        eager_async: false,
        ...options,
      },
      (error, result) => {
        fs.unlink(filePath, () => {}); // dọn file tạm, không cần chờ kết quả
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};