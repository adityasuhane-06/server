import express from 'express';
import bcrypt from "bcrypt"
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './Schema/User.js';
import Blog from './Schema/Blog.js';

import { nanoid } from 'nanoid';
import jwt  from 'jsonwebtoken';
import cors from 'cors';
import admin from "firebase-admin";
import { getAuth } from 'firebase-admin/auth';
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
let passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;

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

const verifyJWT = (req, res, next) => {
    // next this will be called if the token is valid then only the user can access the protected route
    const authHeader = req.headers['authorization'];
    
    const token  =authHeader&&authHeader.split(" ")[1];
    console.log(token)
    if(token===null||token===undefined){
        return res.status(401).json({error:"No access token"})
    }
    jwt.verify(token,process.env.JWT_SECRETKEY,(err,user)=>{
        /* 1. If verification fails (e.g., invalid signature, expired token), err is set, and user is undefined.
           2. If verification succeeds, user contains the decoded payload (e.g., { id: "12345" }).
           3. The comment notes that user is an object containing the id from the      original token’s payload.
            */
        if(err){
            return res.status(403).json({error:"Invalid access token"});
        }
        req.user=user.id;
        console.log("calling next middleware");
        next(); // call the next middleware or route handler allowing the request to proceed
    })

}
const formatData= (users) => {
    const accessToken=jwt.sign({
        id:users._id,

    },process.env.JWT_SECRETKEY)
    // here we are creating a access token for the user
    // this token will be used to authenticate the user in the future requests
    // we are using the user's id to create the token or The payload is an object containing data you want to encode in the token.
    // this token will be sent to the client and the client will use this token to authenticate
    // the secret key is stored in the .env file which is used to sign or create  the token 


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
server.get("/",(req,res)=>{
    res.send("Welcome to the server");
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
           let user=await User.findOne({'personal_info.email':email})
            console.log(user);
            if(!user){
                let username=await generateUserName(email);
                
console.log("username",username);
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
                console.log("user",user);
                user.save().then((u)=>{
                    return res.status(200).json(formatData(u));
                })
                

            }
            else{
                console.log(formatData(user));
                return res.status(200).json(formatData(user));
            }

    }
)

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
server.post('/api/create-blog',verifyJWT,(req,res)=>{
    let authorid=req.user;
    console.log("author id",authorid);
    let {title,content,tags,banner,des,draft}=req.body;
    if(!title.length){
        return res.status(403).json({"error":"Title is required"});

    }
    if(!des.length&&des.length>200){
        return res.status(403).json({"error":"Description is required and must be less than 200 characters"});

    }
    if(!banner.length){
        return res.status(403).json({"error":"Banner is required"});

    }
    if(!tags.length||tags.length>10){
        return res.status(403).json({"error":"Tags are required and must be less than 10 tags"});

    }
    if(!content.blocks.length){
        return res.status(403).json({"error":"There must be some content in the blog"});
    }
    tags=tags.map(tag=>tag.toLowerCase());
    let blog_id=title.replace(/[^a-zA-Z0-9]/g,' ').replace(/\s+/g,"-").trim()+nanoid();
  
    let blog = new Blog({
        title,
        banner,
        des,
        content,
        tags,
        author: authorid,
        blog_id,
        draft: Boolean(draft),

     
})
    console.log("blog",blog);
    blog.save().then(blog=>{
        let incrementValue=draft?0:1;
        if (!mongoose.Types.ObjectId.isValid(authorid)) {
  return res.status(400).json({ error: "Invalid author ID" });
}
        User.findOneAndUpdate({"_id":authorid},
            {
                $inc: {
                    "account_info.total_posts": incrementValue,
                },
                $push: {
                    "blogs": blog._id,
                }
            },
        ).then((user)=>{
            if(!user){
                return res.status(403).json({"error":"User not found"});
            }
            return res.status(200).json({
                success:true,
                blog_id:blog.blog_id,
                message:"Blog created successfully",
                blog:blog,
                
            })
        }).catch((err)=>{
            console.log(err);
            return res.status(500).json({"error":"Internal server error of data ",err});
        }   )
    }).catch(err=>{
        return res.status(500).json({"error":err.message})
    })
}
)


server.get('/api/latest-blogs',(req,res)=>{
    let maxBlogs=5;
    Blog.find({draft:false})
    .populate('author',"personal_info.fullname personal_info.profile_img personal_info.userName-_id").sort({publishedAt:-1}).select("blog_id title des banner activity tags publishedAt").limit(maxBlogs).then((blogs)=>{
        return res.status(200).json({
            success:true,
            blogs:blogs,
        

})
    }).catch((err)=>{
        console.log(err);
});
})

server.post('/api/search-blogs', (req, res) => {
    let {query}=req.body;
  
    if(!query.length){
        return res.status(403).json({"error":"Query is required"});
    }
    let regex = new RegExp(query, 'i'); // 'i' for case-insensitive search
    Blog.find({
        $or: [
            { title: regex },
            { des: regex },
            { tags: regex }
        ],
        draft: false
    })
    .populate('author', "personal_info.fullname personal_info.profile_img personal_info.userName-_id")
    .select("blog_id title des banner activity tags publishedAt").limit(5).sort({activity:-1}).then((blogs) => {
        if (blogs.length === 0) {
            return res.status(404).json({ success: false, message: "No blogs found" });
        }
        return res.status(200).json({
            success: true,
            blogs: blogs,
        });
    })
    .catch((err) => {
        console.log(err);
        return res.status(500).json({ error: "Internal server error" });
    }   
);
});


server.get('/api/trending-blogs', (req, res) => {
    let maxBlogs = 5;
    Blog.find({ draft: false })
        .populate('author', "personal_info.fullname personal_info.profile_img personal_info.userName-_id")
        .sort({ activity: -1 })
        .select("blog_id title des banner activity tags publishedAt")
        .limit(maxBlogs)
        .then((blogs) => {
            return res.status(200).json({
                success: true,
                blogs: blogs,
            });
        })
        .catch((err) => {
            console.log(err);
            return res.status(500).json({ error: "Internal server error" });
        });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}
);
