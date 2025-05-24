import express from 'express';
import bcrypt from "bcrypt"
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Schema/User.js';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import admin from "firebase-admin";
import { getAuth } from 'firebase-admin/auth';
import Blog from './Schema/Blog.js';
import { BlobServiceClient } from "@azure/storage-blob";


dotenv.config();
const  server =express();
server.use(express.json());
server.use(cors());
let port = process.env.PORT || 3000;

if (!process.env.FIREBASE_CREDENTIALS) {
  throw new Error("FIREBASE_CREDENTIALS environment variable is missing");
}
const firebaseConfig = JSON.parse(
  process.env.FIREBASE_CREDENTIALS
);
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});
// now a admin is coonected to firebase project
// now we can use admin to access firebase services

let emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
mongoose.connect(process.env.DATABASE_LOCATION,{
    autoIndex:true,
})


const generateUserName=async(email)=>{
    let username= email.split('@')[0];
    
    let isUSerNameExist = await User.exists({ "personal_info.userName": username }).then((result) => {
        return result ? true : false;
    }
    ).catch((err) => {
        console.log(err);
        return false;
    });
    if(isUSerNameExist){
       
        username = username + nanoid(5);
    }
    console.log(username);
    return username;
}

const formatData= (users) => {
    const accessToken=jwt.sign({
        id:users._id,

    },process.env.JWT_SECRETKEY)
    console.log(users);
    return {
        success: true,

        accessToken,
        user: {
            id: users._id,
            fullname: users.personal_info.fullname,
            email: users.personal_info.email,
            userName: users.personal_info.userName,
            profile_img: users.personal_info.profile_img,
            bio: users.personal_info.bio,
            social_links: {
                youtube: users.social_links.youtube,
                instagram: users.social_links.instagram,
                facebook: users.social_links.facebook,
                twitter: users.social_links.twitter,
                github: users.social_links.github,
                website: users.social_links.website,
            }
        }

       
    }
}


server.post('/api/signup', (req, res) => {
    console.log(req.body);
    let {fullname, email, password} = req.body;

    if(fullname.length<3){
        return res.status(403).json({"error":"fullname must be at least 3 characters long"});
    }
    if(!email.length){
        return res.status(403).json({"error":"Email is required"});
    }
    if(!emailRegex.test(email)){
        return res.status(403).json({"error":"Email is not valid"});
    }
    if(!passwordRegex.test(password)){
        return res.status(403).json({"error":"Password must be at least 8 characters long and contain at least one letter and one number"});
    }
    bcrypt.hash(password, 10, async(err, hash) => {
        if(err){
            return res.status(500).json({"error":"Internal server error"});
        }
        let userName = await generateUserName(email);
       let user = new User({
        personal_info:{
            fullname,
            userName,
            email,
            password: hash,
        },
       },
         ); 
         user.save().then((u)=>{
            return res.status(200).json(formatData(u));
         }).catch((err)=>{
            if(err.code == 11000){
                return res.status(403).json({"error":"Email already exists",message:err.message});
            }
         })

       
    });

});


server.post("/api/login",(req,res)=>{
     console.log(req.body);
    let {email,password}=req.body;
    if(!email.length){
        return res.status(403).json({"email":"Email is required "});
    }
    if(!emailRegex.test(email)){
        return res.status(403).json({"error":"Email is not valid"});
    }
    if(!password.length){
        return res.status(403).json({"error":"Password is required"});
    }
    if(!passwordRegex.test(password)){
        return res.status(403).json({"error":"Password must be at least 8 characters long and contain at least one letter and one number"});
    }
    User.findOne({"personal_info.email":email}).then((user)=>{

        if(!user){
            return res.status(403).json({"error":"User not found"});

        }
        bcrypt.compare(password,user.personal_info.password,(err,result)=>{
            if(err){
                return res.status(500).json({"error":"Internal server error"});
            }
            if(!result){
                return res.status(403).json({"error":"Password is incorrect"});
            }
            return res.status(200).json(formatData(user));
        }
    )

    })
    .catch((err)=>{
        return res.status(500).json({"error":"Internal server error"});

        
    })
}
);





server.post("/api/google-login",async(req,res)=>{
    let {accessToken}=req.body;
    console.log("req body",req.body);
    if(!accessToken.length){
        return res.status(403).json({"error":"Access token is required"});
    }
    getAuth().verifyIdToken(accessToken).then(async(decodedUser)=>{
        console.log("decoded user",decodedUser);
           let {email,name,picture}=decodedUser;
           picture=picture.replace("s96-c","s384-c");
           let user=await User.findOne({'personal_info.email':email}).then((user)=>{
            console.log(user);
            if(!user){
                let username=generateUserName(email);
                user=new User({
                    personal_info:{
                        fullname:name,
                        userName:username,
                        email,
                        password: "",
                        profilePic:picture,
                    },
                    google_auth:true,

                    
                })
                // save the user to the database
                user.save().then((u)=>{
                    return res.status(200).json(formatData(u));
                }).catch((err)=>{
                    if(err.code == 11000){
                        return res.status(403).json({"error":"Email already exists",message:err.message});
                    }
                })

            }
            else{
                console.log(formatData(user));
                return res.status(200).json(formatData(user));
            }

    }).catch((err)=>{
        console.log(err);
        return res.status(500).json({"error":"Internal server error"});
    }
)

})
})


const accountName = process.env.ACCOUNT_NAME;
const sasToken = process.env.SAS_TOKEN;
const containerName = process.env.CONTAINER_NAME;

const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net${sasToken}`
);
const containerClient = blobServiceClient.getContainerClient(containerName);

async function extractMetadataforImage(header) {
  const contentType = header["content-type"];
  const contentDisposition = header["content-disposition"];
  const caption = header["x-caption"] || "No caption provided";

  if (!contentType || !contentDisposition) {
    throw new Error("Missing content type or content disposition");
  }

  const fileType = contentType.split("/")[1];
  const matches = /filename="([^"]+)"/i.exec(contentDisposition);
  const fileName = matches?.[1] || `image-${Date.now()}.${fileType}`;

  return { fileName, caption, fileType };
}

async function extractMetaDataforFile(header) {
    const contentType = header["content-type"];
    const caption = header["x-caption"] || "No caption provided";
    const contentDisposition = header["content-disposition"];
    
    if (!contentType) {
        throw new Error("Missing content type or content disposition");
    }
    
    const fileType = contentType.split("/")[1];
    const matches = /filename="([^"]+)"/i.exec(contentDisposition);
    const  fileName = matches?.[1] || `file-${Date.now()}.${fileType}`;
    
    return { fileName, caption, fileType };

}
const generateUploadURl=async(blobName,dataStream)=>{
   
   const blobClient =containerClient.getBlockBlobClient(blobName);
   await blobClient.uploadStream(dataStream)
   return blobClient.url;

}


server.post("/api/upload-url", async (req, res) => {
  try {
    const header = req.headers;
    const { fileName, caption, fileType } = await extractMetadataforImage(header);
    const imageUrl = await generateUploadURl(fileName, req);
   res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl,
    });
  } catch (err) {
    console.error("Error uploading image:", err);
    res.status(500).json({ error: "Internal server error",err });
  }
});

server.post('/api/upload-file',async(req,res)=>{
    try {
         const { fileName, caption, fileType } = await extractMetaDataforFile(req.headers);
    const fileUrl = await generateUploadURl(fileName, req);
    res.status(200).json({
        message: "file uploaded successfully",
        fileUrl,
      });
        
    } catch (error) {
        console.log(error);
        return res.status(500).json({error:"Internal server error"});
        
    }
   
})







server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}
);