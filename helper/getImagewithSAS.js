export const getImageUrlWithSAS = (imageUrl) => {
    if (!imageUrl) return '';
    
    console.log('Processing URL:', imageUrl.substring(0, 100) + '...');
    
    // If URL already has SAS token, check if it's expired
    if (imageUrl.includes('?sv=')) {
        // Extract the expiration date from the existing SAS token
        const expirationMatch = imageUrl.match(/se=([^&]+)/);
        if (expirationMatch) {
            try {
                const expirationString = decodeURIComponent(expirationMatch[1]);
                const expirationDate = new Date(expirationString);
                const currentDate = new Date();
                
                console.log('Token expires:', expirationDate.toISOString());
                console.log('Current time:', currentDate.toISOString());
                console.log('Is expired:', expirationDate <= currentDate);
                
                // Force update all URLs with new 2026 token (regardless of expiration)
                const baseUrl = imageUrl.split('?')[0];
                const newUrl = baseUrl + process.env.SAS_TOKEN;
                console.log('Updating with new 2026 token');
                return newUrl;
                
            } catch (dateError) {
                console.log('Date parsing error:', dateError);
                const baseUrl = imageUrl.split('?')[0];
                return baseUrl + process.env.SAS_TOKEN;
            }
        }
        return imageUrl;
    }
    
    // If it's our blob storage URL without SAS, add new token
    if (imageUrl.includes(`${process.env.ACCOUNT_NAME}.blob.core.windows.net`)) {
        return imageUrl + process.env.SAS_TOKEN;
    }
    
    return imageUrl;
};

