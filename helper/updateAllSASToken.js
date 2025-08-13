// Force update endpoint to replace ALL SAS tokens with the new 2026 one
import express from 'express';
import Blog from '../models/Blog.js';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();
const server = express();
server.post('/api/update-all-sas-tokens', async (req, res) => {
    try {
        let updatedCount = 0;
        const sasToken = process.env.SAS_TOKEN;
        
        console.log('Starting complete SAS token update...');
        console.log('New SAS token expires: August 2026');

        // Update all blog banners
        const blogs = await Blog.find({
            banner: { $regex: /blogimages01\.blob\.core\.windows\.net/ }
        });

        console.log(`Found ${blogs.length} blogs with banners to update`);

        for (let blog of blogs) {
            const originalUrl = blog.banner;
            const baseUrl = originalUrl.split('?')[0]; // Remove old SAS token
            blog.banner = baseUrl + sasToken; // Add new SAS token
            await blog.save();
            updatedCount++;
            console.log(`Updated blog ${blog.blog_id}`);
        }

        // Update all user profile images (if any are from blob storage)
        const users = await User.find({
            'personal_info.profile_img': { $regex: /blogimages01\.blob\.core\.windows\.net/ }
        });

        console.log(`Found ${users.length} users with profile images to update`);

        for (let user of users) {
            const originalUrl = user.personal_info.profile_img;
            const baseUrl = originalUrl.split('?')[0];
            user.personal_info.profile_img = baseUrl + sasToken;
            await user.save();
            updatedCount++;
            console.log(`Updated user ${user.personal_info.userName}`);
        }

        // Update all content images
        const blogsWithContent = await Blog.find({
            'content.blocks': {
                $elemMatch: {
                    'type': 'image',
                    'data.file.url': { $regex: /blogimages01\.blob\.core\.windows\.net/ }
                }
            }
        });

        console.log(`Found ${blogsWithContent.length} blogs with content images to update`);

        for (let blog of blogsWithContent) {
            let blogUpdated = false;
            
            if (blog.content && blog.content.blocks) {
                blog.content.blocks.forEach(block => {
                    if (block.type === 'image' && 
                        block.data?.file?.url && 
                        block.data.file.url.includes('blogimages01.blob.core.windows.net')) {
                        
                        const originalUrl = block.data.file.url;
                        const baseUrl = originalUrl.split('?')[0];
                        block.data.file.url = baseUrl + sasToken;
                        blogUpdated = true;
                    }
                });
            }

            if (blogUpdated) {
                await blog.save();
                updatedCount++;
                console.log(`Updated content images in blog ${blog.blog_id}`);
            }
        }

        res.json({
            success: true,
            message: `Successfully updated ${updatedCount} records with new SAS token (expires August 2026)`,
            details: {
                blogsWithBanners: blogs.length,
                usersWithImages: users.length,
                blogsWithContentImages: blogsWithContent.length,
                totalUpdated: updatedCount
            }
        });

    } catch (error) {
        console.error('Error updating SAS tokens:', error);
        res.status(500).json({ 
            error: 'Failed to update SAS tokens', 
            details: error.message 
        });
    }
});