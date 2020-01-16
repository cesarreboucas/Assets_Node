const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const AssetSchema = new Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Um User e necessario'],
      ref: 'user',
    },
    code: {
      type: String, required: [true, 'Um codigo e necessario'],
      max: [20, 'Sorry you reached the maximum number of characters']
    },
    balance: { type: Number },
    unit: { type: Number },
    irr: { type: Number },
    group: {
      type: Object,
      group_a: { type: String },
      group_b: { type: String },
      group_c: { type: String },
    },
    movements: [{
      type: Object,
      mov_id: { type: mongoose.Schema.Types.ObjectId, required: [true, 'Um codigo e necessario'] },
      date: { type: Date }, // YYYY-MM-DD
      kind: { type: String },
      value: { type: Number },
      comment: { type: String, max: [40, 'Sorry you reached the maximum number of characters'] },
    }],
  }
);

AssetSchema.methods.setInterval = function () {
  const tempNow = new Date();
  this.sum_in = 0;
  this.sum_out = 0;
  const now = new Date(tempNow.getFullYear(), tempNow.getMonth(), tempNow.getDate(), 0, 0, 0, 0);
  const currentyear = now.getFullYear();
  const milionaday = 86400000 // 1000 * 60 * 60 * 24;
  const daysonthisyear = Math.ceil((now - new Date(currentyear, 0, 1, 0, 0, 0, 0)) / milionaday);
  let dateArr, daystonextyear;

  for (let x = 0; x < this.movements.length; ++x) {
    if (typeof this.movements[x].date == 'string') {
      dateArr = this.movements[x].date.split('-');
      this.movements[x].date = new Date(dateArr[0], dateArr[1] - 1, dateArr[2], 0, 0, 0, 0);
    }
    daystonextyear = Math.ceil((new Date((this.movements[x].date.getFullYear() + 1), 0, 1, 0, 0, 0, 0) - this.movements[x].date) / milionaday);
    this.movements[x].interval = (currentyear - this.movements[x].date.getFullYear()) + ((daysonthisyear + daystonextyear) / 365) - 1;
    if (this.movements[x].value > 0) { this.sum_in += this.movements[x].value; } else { this.sum_out += this.movements[x].value; }
  }




  this.movements.push(
    {
      date: now,
      kind: "p",
      value: this.total,
      interval: 0
    }
  );
  //console.log("This: "+this);
  this.sum_in += this.total;
};

AssetSchema.methods.sortMovements = function () {
  this.movements.sort(function (mA, mB) {
    return (mA.date - mB.date);
  });
};

AssetSchema.methods.setGuess = function () {
  //Calculo apenas com um minimo de 29 dias. (29/365) = ~ 0.08
  const min_interval = 0.08;
  let retorno = (this.sum_in / -this.sum_out);
  //console.log(retorno);

  if (this.movements[0].interval < min_interval || this.movements.length == 2) { // Intervalo pequeno ou apenas 2 movimentos
    if (isNaN(retorno) || retorno <= 0.01) { // sem saida ou sem entrada / prejuizo muito grande.
      console.log("Retorno da Merda - " + this.code);
      this.irr = -0.99;
    } else { // Calculo Simples
      console.log("Ret Simples Oper: " + this.movements.length + " Taxa:" + (Math.pow(retorno, (1 / Math.max(min_interval, this.movements[0].interval))) - 1) + " " + this.codigo);
      this.irr = (Math.pow(retorno, (1 / Math.max(min_interval, this.movements[0].interval))) - 1);
    }
  } else {
    if (isNaN(this.irr)) { this.irr = retorno; }
    this.setIRR();
  }
};

AssetSchema.methods.setIRR = function () {

  var i = 0;
  var vp_second = 0;
  var guess_second = 0;
  var vp_third = 0;
  var guess_third = 0;

  do {
    // Seguranca do Guess
    if ((this.irr > 2 && i == 0) || (this.irr < -0.5 && i == 0) || isNaN(this.irr)) { // Maior que 200% ou menor que -50%
      this.irr = 0.1 * i;
    }
    ++i;
    vp_all = this.checkVP();

    if (isNaN(vp_all)) {
      this.irr = 0;
      vp_all = this.checkVP();
      if (isNaN(vp_all)) {
        i = 100;
        this.irr = 0;
        break;
      }
    }

    vp_third = vp_second;
    guess_third = guess_second;
    vp_second = vp_all;
    guess_second = this.irr;

    if (i >= 6) {
      if (Math.abs(vp_all) > Math.abs(vp_second) || Math.abs(vp_second) > Math.abs(vp_third)) {
        // Nao estou aproximando do Zero, provavelmente o IRR e impossivel
        i = 100;
        this.irr = 0;
        break;
      }
    }

    console.log('Try: ' + i + ' VP: ' + vp_all.toFixed(4) + ' Guess: ' + this.irr.toFixed(8) + ' IN:' + this.sum_in + ' COD: ' + this.codigo);

    if (vp_third != 0) {
      this.irr = guess_second - (((guess_third - guess_second) * vp_second) / (vp_third - vp_second));

      console.log('New Gues by Interpolation: ' + this.irr);
      console.log('Used -> Gues_Sec: ' + guess_second + ' Guess_Third: ' + guess_third);
      console.log('Used -> Vp_Sec: ' + vp_second + ' VP_Third: ' + vp_third);

    } else {
      this.irr += (vp_all / this.sum_in);
      console.log('New Gues by else ' + this.irr);
    }


    //console.log("VPS: "+vp_all+" "+vp_second+" "+vp_third);
    console.log('\n');

  } while (Math.abs(vp_all) > 0.01 && i < 100);
  console.log('IRR: ' + Number(this.irr * 100).toFixed(2) + '% Try:' + i);
}

AssetSchema.methods.checkVP = function () {
  let sum = 0;
  guessPlusOne = (this.irr + 1);
  this.movements.forEach(element => {
    sum += element.value * Math.pow((guessPlusOne), element.interval);
  });
  return sum;
}

AssetSchema.virtual('total').get(function () {
  return Number(this.balance * this.unit);
})
  .set(function (v) {
    this.saldo = 1;
    this.unitario = v;
  });

AssetSchema.set('toJSON', { getters: true, virtuals: true });


module.exports = mongoose.model('asset', AssetSchema);