<!DOCTYPE html>
<html lang="ur">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Urdu Design App</title>

<style>
body {
    margin: 0;
    font-family: 'Noto Nastaliq Urdu', serif;
    background: #f4f4f4;
    direction: rtl;
}

header {
    background: #008080;
    color: white;
    padding: 15px;
    text-align: center;
    font-size: 22px;
}

.container {
    padding: 20px;
}

.card {
    background: white;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 10px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

button {
    background: #008080;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    margin-top: 10px;
}

button:hover {
    background: #006666;
}

textarea {
    width: 100%;
    height: 100px;
    border-radius: 5px;
    padding: 10px;
    font-size: 16px;
}
</style>
</head>

<body>

<header>
    اردو ڈیزائن ایپ
</header>

<div class="container">

    <div class="card">
        <h3>اپنا اردو متن لکھیں</h3>
        <textarea id="urduText" placeholder="یہاں لکھیں..."></textarea>
        <button onclick="showText()">ڈیزائن دیکھیں</button>
    </div>

    <div class="card">
        <h3>نتیجہ</h3>
        <p id="result"></p>
    </div>

</div>

<script>
function showText() {
    var text = document.getElementById("urduText").value;
    document.getElementById("result").innerHTML = text;
}
</script>

</body>
</html>
