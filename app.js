const axios = require('axios');
const _ = require('lodash');
const moment = require('moment');
const { ethers } = require('ethers');
const tweet = require('./tweet');

function formatAndSendTweet(event) {
    const tokenName = _.get(event, ['asset', 'name']);
    const image = _.get(event, ['asset', 'image_url']);
    const openseaLink = _.get(event, ['asset', 'permalink']);
    const totalPrice = _.get(event, 'total_price');
    const usdValue = _.get(event, ['payment_token', 'usd_price']);
    const tokenSymbol = _.get(event, ['payment_token', 'symbol']);
    const buyer = _.get(event, ['winner_account', 'user', 'username'], 'Anonymous') || 'Anonymous';
    const seller = _.get(event, ['seller', 'user', 'username'], 'Anonymous') || 'Anonymous';

    const formattedTokenPrice = ethers.utils.formatEther(totalPrice.toString());
    const formattedUsdPrice = (formattedTokenPrice * usdValue).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const formattedPriceSymbol = (
        (tokenSymbol === 'WETH' || tokenSymbol === 'ETH') 
            ? 'ETH' 
            : `${tokenSymbol}`
    );

    const tweetText = `${tokenName} bought for ${formattedTokenPrice} ${formattedPriceSymbol} ($${formattedUsdPrice}) by ${buyer} from ${seller} ${openseaLink}`;

    console.log(tweetText);

    return tweet.handleDupesAndTweet(`${tokenName} bought for`, tweetText, image);
}

async function formatAndSendAuctionTweet(bid, exchangeRate) {
    const query = `
    {
        blitmaps(where: {id: ${bid['tokenId']}}) {
            id
            name
            owner
            creator
            creatorName
            parents
            isOriginal
            remainingVariants
            tokenID
            slabs
            affinity
        }
    }
    `;

    var response;
    try {
        response = await axios.post('https://api.thegraph.com/subgraphs/name/domhofmann/blitmap', {
            query: query
        });
    } catch {
        return;
    }
    const blip = response.data.data.blitmaps[0];

    const tokenName = `#${blip.tokenID} - ${blip.name}`;
    const image = `https://api.blitmap.com/v1/png/${blip.tokenID}`;
    const openseaLink = `https://blit.house/0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63/${bid['tokenId']}`;
    const usdValue = parseFloat(exchangeRate);

    const formattedTokenPrice = ethers.utils.formatEther(bid['value'].toString());
    const formattedUsdPrice = (formattedTokenPrice * usdValue).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const formattedPriceSymbol = 'ETH'

    const tweetText = `${tokenName} received a bid of ${formattedTokenPrice} ${formattedPriceSymbol} ($${formattedUsdPrice}) ${openseaLink}`;

    // console.log(tweetText, image);

    return tweet.handleDupesAndTweet(tokenName, tweetText, image);
}

var exchangeRate = 0;

// Poll OpenSea every minute & retrieve all sales for a given collection in the last minute
// Then pass those events over to the formatter before tweeting
setInterval(() => {
    const lastMinute = moment().startOf('minute').subtract(8, "minutes").unix();

    axios.get('https://api.opensea.io/api/v1/events', {
        headers: {
            'X-API-KEY': process.env.OPENSEA_API_KEY
        },
        params: {
            collection_slug: process.env.OPENSEA_COLLECTION_SLUG,
            event_type: 'successful',
            occurred_after: lastMinute,
            only_opensea: 'false'
        }
    }).then((response) => {
        const events = _.get(response, ['data', 'asset_events']);

        console.log(`${events.length} sales in the last minute for ${process.env.OPENSEA_COLLECTION_SLUG}...`);

        _.each(events, (event) => {
            return formatAndSendTweet(event);
        });
    }).catch((error) => {
        console.error(error);
    });

    axios.get('https://api.coinbase.com/v2/exchange-rates?currency=ETH')
    .then((response) => {
        exchangeRate = _.get(response, ['data', 'data', 'rates', 'USD']);

        axios.post('https://indexer-dev-mainnet.hasura.app/api/rest/auction-activity', {
            address: '0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63',
            start: moment().startOf('minute').subtract(8, "minutes").toISOString()
        }).then((response) => {
            const bids = _.get(response, ['data', 'AuctionBidEvent']);
            _.each(bids, (bid) => {
                return formatAndSendAuctionTweet(bid, exchangeRate);
            });
        }).catch((error) => {
            console.error(error);
        });

    }).catch((error) => {
        console.error(error);
    });
}, 60000);
