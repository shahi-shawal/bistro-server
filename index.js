const express = require ('express')
const cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5001


// middleaware 
app.use(cors())
app.use(express.json())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lkv2aht.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("boss-restaurent");
    const menuCollection = database.collection("menu");
    const cartCollection = database.collection("cart");
    const userCollection = database.collection("users");
    const paymentCollection = database.collection("payments");
                                                        
// middleware

const verifyToken = (req, res, next)=>{
  console.log("inside verify token",req.headers.authoraization)
  if (!req.headers.authoraization) {
    return res.status(401).send({massage:"unothorazed access"})
  }
 const token = req.headers.authoraization.split(' ')[1]
 jwt.verify(token,process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
  if (err) {
    return res.status(401).send({massage:"unothorazed access"})
  }
  req.decoded= decoded
  next()
 })

  // next()
}

//verify token admin 

const verifyAdmin = async(req, res,next)=>{
  const email = req.decoded.email
  const query={email: email}
  const user = await userCollection.findOne(query)
  const isAdmin = user?.role === "admin"
  if (!isAdmin) {
    return res.status(403).send({massage:"forbidden access"})
  }
  next()
}




  app.post('/jwt', async(req, res)=>{
    const user = req.body
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn:"1h"})
    res.send({token})
  })



    app.get("/users",verifyToken,verifyAdmin, async(req, res)=>{
      
      const result = await userCollection.find().toArray()
      res.send(result)
    })

   app.delete("/users/:id",verifyToken,verifyAdmin, async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await userCollection.deleteOne(query)
    res.send(result)
   })

   app.patch("/users/admin/:id",verifyToken,verifyAdmin, async(req, res)=>{
     const id = req.params.id;
     const filter = {_id: new ObjectId(id)}
     const upatedDoc ={
      $set:{
         role:"admin"
      }
     }
     const result = await userCollection.updateOne(filter,upatedDoc)
     res.send(result)
   })

   app.get("/users/admin/:email",verifyToken, async(req, res)=>{
    const email = req.params.email;
    console.log(email)
    console.log(req.decoded.email)
    if (email !== req.decoded.email) {
      return res.status(403).send({massage:"forbiden access"})

    }
    const query = {
      email: email
    }
    const user = await userCollection.findOne(query)
    let admin= false
    if (user) {
      admin= user?.role ==='admin'
    }
    res.send({admin})
   })


    app.post("/users", async(req, res)=>{
      const users = req.body

      const query ={email: users.email}
      const existinguser = await userCollection.findOne(query)
      if(existinguser){
       return res.send({massage:"user already exist",insertedId:null})
      }
      const result = await userCollection.insertOne(users)
      res.send(result)
    })


   app.get("/menu", async(req, res)=>{
    const result = await menuCollection.find().toArray()
    console.log(result);
    res.send(result)
   })

   app.post("/menu",verifyToken, verifyAdmin, async(req, res)=>{
    const item = req.body
    const result= await menuCollection.insertOne(item)
    res.send(result)
   })
   app.delete("/menu/:id",verifyToken, verifyAdmin, async(req, res)=>{
    const id = req.params.id
    const query={
      _id: new ObjectId(id)
    }
    const result= await menuCollection.deleteOne(query)
    res.send(result)
   })


  //  Cart collection 
  
  app.get("/carts", async(req, res)=>{
    const email = req.query.email
    const query = {email : email}
    const result = await cartCollection.find(query).toArray()
    res.send(result)
  })

  app.delete("/carts/:id",  async(req, res)=>{
    const id = req.params.id;
    const query ={_id: new ObjectId(id)}
    const result = await cartCollection.deleteOne(query)
    res.send(result)
  })


  app.post("/carts", async(req, res)=>{
    const cartItem = req.body
    const result = await cartCollection.insertOne(cartItem)
    res.send(result)
  })

//payment method

app.post("/create-payment-intent", async(req, res)=>{
  const {price}= req.body
  const amount = parseInt(price * 100)
  console.log(amount, "amonut inside ")
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "usd",
    payment_method_types:['card']

  })
  res.send({
    clientSecret: paymentIntent.client_secret
  })
})

//

app.get("/payment/:email",verifyToken, async(req, res)=>{
  const query= {email: req.params.email}
  if (req.params.email !== req.decoded.email) {
    res.status(403).send({massage:"Forbiden access"})
  } 
  const result = await paymentCollection.find(query).toArray()
  res.send(result)
})



app.post('/payment', async(req, res)=>{
  const payment= req.body
  const paymentResult = await paymentCollection.insertOne(payment)
  console.log("payment info", payment);
  const query ={
    _id:{
      $in: payment.cartId.map(id=> new ObjectId(id))
    }
  }
  const deleteresult = await cartCollection.deleteMany(query)
  res.send({paymentResult, deleteresult})
})

//staste or analytic

app.get("/adminStates", verifyToken, verifyAdmin, async(req, res)=>{
  const user = await userCollection.estimatedDocumentCount()
  const menuItem = await menuCollection.estimatedDocumentCount()
  const orders = await paymentCollection.estimatedDocumentCount()
  
  //this is not the best way
  // const payments = await paymentCollection.find().toArray()
  // const reveneu = payments.reduce((t,p)=>t+p.price ,0)
  
  const result = await paymentCollection.aggregate([
    {
      $group:{
        _id:null,
        totalRevenue:{
          $sum:'$price'
        }
      }
  }
]).toArray()

const reveneu = result.length > 0?  result[0].totalRevenue : 0
  res.send({
    user,
    menuItem,
    orders,
    reveneu
  })
})


//using  aggreget pipline
app.get('/orderSates',verifyToken, verifyAdmin, async(req, res)=>{
  const result = await paymentCollection.aggregate([
    {
     $unwind: '$menuItemId'
  },
  {
    $lookup:{
      from:'menu',
      localField:'menuItemId',
      foreignField:"_id",
      as:'menuItems'
    },
   
  },
  {
    $unwind: '$menuItems'
 },
 {
  $group:{
    _id:'$menuItems.category',
    quantity:{ $sum :1},
    totalRevenue:{$sum:'$menuItems.price'}
  }
 } ,
 {
  $project:{
    _id:0,
    category:'$_id',
    quantity:'$quantity',
    revenue:'$totalRevenue'
  }
}
]).toArray()
res.send(result)
})



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get("/", (req,res)=>{
    res.send("Boss serverr runing")
})




app.listen(port,()=>{
    console.log(`boss running ${port}`);
})